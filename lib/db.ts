import Database from 'better-sqlite3';
import path from 'path';
import type { Event, FilterState } from './types';

const NEIGHBORHOOD_BOUNDS: Record<string, { latMin: number; latMax: number; lonMin: number; lonMax: number }> = {
  'Upper Manhattan': { latMin: 40.80, latMax: 40.88, lonMin: -73.97, lonMax: -73.91 },
  'Midtown': { latMin: 40.74, latMax: 40.80, lonMin: -74.01, lonMax: -73.95 },
  'Lower Manhattan': { latMin: 40.70, latMax: 40.74, lonMin: -74.02, lonMax: -73.97 },
  'Brooklyn': { latMin: 40.57, latMax: 40.74, lonMin: -74.04, lonMax: -73.83 },
  'Queens': { latMin: 40.54, latMax: 40.80, lonMin: -73.96, lonMax: -73.70 },
  'Bronx': { latMin: 40.80, latMax: 40.92, lonMin: -73.93, lonMax: -73.75 },
  'Staten Island': { latMin: 40.49, latMax: 40.65, lonMin: -74.26, lonMax: -74.05 },
};

const DB_PATH = path.join(process.cwd(), 'data', 'events.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    // Handle Python-style dicts/lists with single quotes
    try {
      const fixed = value
        .replace(/'/g, '"')
        .replace(/\bNone\b/g, 'null')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false');
      return JSON.parse(fixed) as T;
    } catch {
      return fallback;
    }
  }
}

function parseEventRow(row: Record<string, unknown>): Event {
  return {
    ...row,
    is_free: Boolean(row.is_free),
    categories: parseJsonField<string[]>(row.categories as string, []),
    tags: parseJsonField<string[]>(row.tags as string, []),
    reviews: parseJsonField(row.reviews as string, []),
    derisk: parseJsonField(row.derisk as string, {}),
    data: parseJsonField(row.data as string, {}),
  } as unknown as Event;
}

/**
 * Haversine distance in km between two lat/lon points
 */
function haversineCondition(): string {
  // We'll compute distance in SQL using an approximation.
  // For precise haversine, we compute in the WHERE clause.
  return `(
    6371 * 2 * asin(sqrt(
      pow(sin(radians((lat - @lat) / 2)), 2) +
      cos(radians(@lat)) * cos(radians(lat)) *
      pow(sin(radians((lon - @lon) / 2)), 2)
    ))
  )`;
}

export function getEvents(filters: FilterState & { page?: number; page_size?: number } = {}): {
  events: Event[];
  total: number;
} {
  const db = getDb();
  const conditions: string[] = [
    'status IN (\'published\', \'done\', \'new\')',
    // Exclude rewards/loyalty/club programs — not real events
    'title NOT LIKE \'%Rewards%\'',
    'title NOT LIKE \'%Royalty%\'',
    'title NOT LIKE \'%Loyalty%\'',
    'title NOT LIKE \'%Club Baja%\'',
    'title NOT LIKE \'%Join Club%\'',
    '(category_l1 IS NULL OR category_l1 NOT IN (\'food\', \'networking\'))',
    // Hide past events: keep if it hasn't ended yet (or, if no end time, hasn't started > 1 day ago)
    "(COALESCE(next_end_at, datetime(next_start_at, '+1 day')) >= datetime('now') OR next_start_at IS NULL)",
  ];
  const params: Record<string, unknown> = {};

  // DB has legacy category values — map canonical names to all known DB variants
  const CAT_ALIASES: Record<string, string[]> = {
    'arts': ['arts', 'Art'],
    'family': ['family', "Children's Activities"],
  };

  if (filters.categories && filters.categories.length > 0) {
    const catConditions = filters.categories.map((cat, i) => {
      const aliases = CAT_ALIASES[cat] || [cat];
      const aliasConds = aliases.map((alias, j) => {
        params[`cat_${i}_${j}`] = `%"${alias}"%`;
        params[`cat_exact_${i}_${j}`] = alias;
        return `(categories LIKE @cat_${i}_${j} OR category_l1 = @cat_exact_${i}_${j})`;
      });
      return `(${aliasConds.join(' OR ')})`;
    });
    conditions.push(`(${catConditions.join(' OR ')})`);
  }

  if (filters.excludeCategories && filters.excludeCategories.length > 0) {
    filters.excludeCategories.forEach((cat, i) => {
      const aliases = CAT_ALIASES[cat] || [cat];
      aliases.forEach((alias, j) => {
        params[`excat_${i}_${j}`] = `%"${alias}"%`;
        params[`excat_exact_${i}_${j}`] = alias;
        conditions.push(`(categories NOT LIKE @excat_${i}_${j} AND category_l1 != @excat_exact_${i}_${j})`);
      });
    });
  }

  if (filters.priceMin !== undefined) {
    params.price_min = filters.priceMin;
    conditions.push('price_max >= @price_min');
  }

  if (filters.priceMax !== undefined) {
    params.price_max = filters.priceMax;
    conditions.push('price_min <= @price_max');
  }

  if (filters.isFree !== undefined) {
    params.is_free = filters.isFree ? 1 : 0;
    conditions.push('is_free = @is_free');
  }

  if (filters.ageMax !== undefined) {
    params.age_max = filters.ageMax;
    // Child's age must fall within the event's age range:
    // - age_best_from (or age_min) <= child_age  → child is old enough
    // - age_best_to >= child_age                 → child isn't too old
    // Events with no age data (all NULLs) pass through.
    conditions.push(
      '((COALESCE(age_best_from, age_min) IS NULL OR COALESCE(age_best_from, age_min) <= @age_max)' +
      ' AND (age_best_to IS NULL OR age_best_to >= @age_max))'
    );
  }

  if (filters.dateFrom) {
    params.date_from = filters.dateFrom;
    conditions.push('next_end_at >= @date_from');
  }

  if (filters.dateTo) {
    params.date_to = filters.dateTo;
    conditions.push('next_start_at <= @date_to');
  }

  if (filters.search) {
    params.search = `%${filters.search}%`;
    conditions.push('(title LIKE @search OR description LIKE @search OR tagline LIKE @search OR tags LIKE @search OR category_l1 LIKE @search OR venue_name LIKE @search)');
  }

  // Fix 2: Location text search (venue, address, city, district)
  if (filters.location) {
    params.location = `%${filters.location}%`;
    conditions.push('(venue_name LIKE @location OR address LIKE @location OR city LIKE @location)');
  }

  // Fix 3: Accessibility filters (search in JSON data field)
  if (filters.wheelchairAccessible) {
    conditions.push("data LIKE '%\"venue_wheelchair_accessible\": true%' OR data LIKE '%\"venue_wheelchair_accessible\":true%'");
  }
  if (filters.strollerFriendly) {
    conditions.push("data LIKE '%\"venue_stroller_friendly\": true%' OR data LIKE '%\"venue_stroller_friendly\":true%'");
  }

  // Neighborhood filter: bounding-box for events with coordinates + text fallback for events without
  if (filters.neighborhoods && filters.neighborhoods.length > 0 && !filters.neighborhoods.includes('Anywhere in NYC')) {
    const nbConds: string[] = [];
    const textConds: string[] = [];
    filters.neighborhoods.forEach((nb, i) => {
      const bounds = NEIGHBORHOOD_BOUNDS[nb];
      if (bounds) {
        params[`nb_latmin_${i}`] = bounds.latMin;
        params[`nb_latmax_${i}`] = bounds.latMax;
        params[`nb_lonmin_${i}`] = bounds.lonMin;
        params[`nb_lonmax_${i}`] = bounds.lonMax;
        nbConds.push(`(lat BETWEEN @nb_latmin_${i} AND @nb_latmax_${i} AND lon BETWEEN @nb_lonmin_${i} AND @nb_lonmax_${i})`);
      }
      // Text fallback: match city, address, or venue_name
      params[`nb_text_${i}`] = `%${nb}%`;
      textConds.push(`(city LIKE @nb_text_${i} OR address LIKE @nb_text_${i} OR venue_name LIKE @nb_text_${i})`);
    });
    const geoCond = nbConds.length > 0
      ? `(lat IS NOT NULL AND lon IS NOT NULL AND (${nbConds.join(' OR ')}))`
      : '';
    const txtCond = textConds.length > 0 ? `(${textConds.join(' OR ')})` : '';
    const combined = [geoCond, txtCond].filter(Boolean).join(' OR ');
    if (combined) conditions.push(`(${combined})`);
  }

  let distanceSelect = '';
  let distanceCondition = '';
  // Prioritize NYC events with coordinates over nationwide ones
  let orderBy = 'ORDER BY (CASE WHEN lat IS NOT NULL AND lon IS NOT NULL AND lat BETWEEN 40.4 AND 41.0 AND lon BETWEEN -74.3 AND -73.6 THEN 0 ELSE 1 END), next_start_at ASC';

  if (filters.lat !== undefined && filters.lon !== undefined && filters.distance !== undefined) {
    params.lat = filters.lat;
    params.lon = filters.lon;
    params.distance = filters.distance;
    conditions.push('lat IS NOT NULL AND lon IS NOT NULL');
    distanceSelect = `, ${haversineCondition()} as _distance`;
    distanceCondition = `AND ${haversineCondition()} <= @distance`;
    orderBy = 'ORDER BY _distance ASC';
  }

  const whereClause = conditions.join(' AND ');

  // SQLite doesn't have radians() built-in, so we register it
  db.function('radians', (deg: number) => (deg * Math.PI) / 180);
  db.function('asin', (x: number) => Math.asin(x));
  db.function('sqrt', (x: number) => Math.sqrt(x));
  db.function('pow', (base: number, exp: number) => Math.pow(base, exp));
  db.function('cos', (x: number) => Math.cos(x));
  db.function('sin', (x: number) => Math.sin(x));

  // Count query
  const countSql = `SELECT COUNT(*) as count FROM events WHERE ${whereClause} ${distanceCondition}`;
  const countRow = db.prepare(countSql).get(params) as { count: number };
  const total = countRow.count;

  // Data query
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const offset = (page - 1) * pageSize;
  params.limit = pageSize;
  params.offset = offset;

  const dataSql = `SELECT *${distanceSelect} FROM events WHERE ${whereClause} ${distanceCondition} ${orderBy} LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(dataSql).all(params) as Record<string, unknown>[];

  // Deduplicate by title + venue_name (some events appear twice with different pricing tiers)
  const seen = new Set<string>();
  const deduped = rows.filter((row) => {
    const key = `${(row.title as string || '').toLowerCase()}|${(row.venue_name as string || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    events: deduped.map(parseEventRow),
    total: Math.max(total - (rows.length - deduped.length), deduped.length),
  };
}

export function getEventById(id: number): Event | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseEventRow(row);
}

export function getCategories(): { value: string; label: string }[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT category_l1 FROM events WHERE category_l1 IS NOT NULL AND status IN (\'published\', \'done\', \'new\') ORDER BY category_l1').all() as { category_l1: string }[];

  const labelMap: Record<string, string> = {
    family: 'Family & Kids',
    arts: 'Arts & Culture',
    theater: 'Theater & Performing Arts',
    attractions: 'Attractions & Activities',
    books: 'Literary & Books',
    holiday: 'Holiday & Seasonal',
    sports: 'Sports & Fitness',
    Art: 'Arts & Culture',
    "Children's Activities": 'Family & Kids',
  };

  // Preferred canonical value for each label (used when deduplicating)
  const canonicalValue: Record<string, string> = {
    'Family & Kids': 'family',
    'Arts & Culture': 'arts',
  };

  const seen = new Set<string>();
  const result: { value: string; label: string }[] = [];

  for (const row of rows) {
    if (!row.category_l1) continue; // skip empty
    const label = labelMap[row.category_l1] || row.category_l1;
    if (seen.has(label)) continue; // skip duplicate labels
    seen.add(label);
    // Use canonical value if defined, otherwise raw DB value
    const value = canonicalValue[label] ?? row.category_l1;
    result.push({ value, label });
  }

  return result;
}

export function getEventsForChat(query?: string): { id: number; title: string; category_l1: string; tagline: string; venue_name: string; next_start_at: string; is_free: boolean; price_summary: string; age_label: string; city: string; address: string }[] {
  const db = getDb();

  const baseWhere = `status IN ('published', 'done', 'new') AND title NOT LIKE '%Rewards%' AND title NOT LIKE '%Royalty%' AND title NOT LIKE '%Loyalty%' AND title NOT LIKE '%Club Baja%' AND title NOT LIKE '%Join Club%' AND (category_l1 IS NULL OR category_l1 NOT IN ('food', 'networking')) AND (COALESCE(next_end_at, datetime(next_start_at, '+1 day')) >= datetime('now') OR next_start_at IS NULL)`;
  const fields = `id, title, category_l1, tagline, venue_name, next_start_at, is_free, price_summary, age_label, city, address`;

  let searchWhere = '';
  const params: Record<string, unknown> = {};
  if (query) {
    params.search = `%${query}%`;
    searchWhere = ` AND (title LIKE @search OR tagline LIKE @search OR description LIKE @search OR tags LIKE @search)`;
  }

  // Traverse FULL dataset (not just top-N). When a query is supplied, the
  // LIKE filter in `searchWhere` already narrows the candidate set in SQL.
  // Otherwise we walk the whole table in stable pages and only cap at the
  // very end (token-budget guard for the LLM prompt).
  const PAGE = 500;
  const HARD_CAP = 250; // upper bound for prompt tokens (~7.5k tokens)
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  let processed = 0;
  // safeguard: never loop more than the table size / page
  for (let i = 0; i < 50; i++) {
    const page = db.prepare(
      `SELECT ${fields} FROM events WHERE ${baseWhere}${searchWhere}
       ORDER BY next_start_at ASC
       LIMIT @lim OFFSET @off`
    ).all({ ...params, lim: PAGE, off: offset }) as Record<string, unknown>[];
    if (page.length === 0) break;
    all.push(...page);
    processed += page.length;
    offset += PAGE;
    if (page.length < PAGE) break; // no more data
  }

  // Mix in top-rated so good evergreen events aren't lost when we cap.
  const topRated = db.prepare(
    `SELECT ${fields} FROM events WHERE ${baseWhere}${searchWhere}
     ORDER BY rating_avg DESC, rating_count DESC LIMIT 50`
  ).all(params) as Record<string, unknown>[];

  // Fallback: if query-narrowed traversal returns too little, also pull the
  // full unfiltered traversal so the LLM still sees the wider catalogue.
  let fallback: Record<string, unknown>[] = [];
  if (query && all.length + topRated.length < 60) {
    let foff = 0;
    for (let i = 0; i < 50; i++) {
      const page = db.prepare(
        `SELECT ${fields} FROM events WHERE ${baseWhere}
         ORDER BY next_start_at ASC LIMIT @lim OFFSET @off`
      ).all({ lim: PAGE, off: foff }) as Record<string, unknown>[];
      if (page.length === 0) break;
      fallback.push(...page);
      foff += PAGE;
      if (page.length < PAGE) break;
    }
  }

  // Deduplicate while preserving order: query-matches first, then top-rated,
  // then unfiltered fallback.
  const seen = new Set<number>();
  const combined: Record<string, unknown>[] = [];
  for (const row of [...all, ...topRated, ...fallback]) {
    const id = row.id as number;
    if (!seen.has(id)) {
      seen.add(id);
      combined.push(row);
    }
  }

  console.log(`[getEventsForChat] processed=${processed} unique=${combined.length} query=${query || '∅'} → cap=${HARD_CAP}`);

  return combined.slice(0, HARD_CAP).map((row) => ({
    ...row,
    is_free: Boolean(row.is_free),
  })) as { id: number; title: string; category_l1: string; tagline: string; venue_name: string; next_start_at: string; is_free: boolean; price_summary: string; age_label: string; city: string; address: string }[];
}
