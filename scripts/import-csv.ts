import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

const csvPath = path.join(__dirname, '..', 'data', 'event_us.csv');
const dbPath = path.join(__dirname, '..', 'data', 'events.db');

// Remove existing db
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    short_title TEXT,
    tagline TEXT,
    description TEXT,
    source_url TEXT,
    image_url TEXT,
    venue_name TEXT,
    subway TEXT,
    address TEXT,
    city TEXT,
    lat REAL,
    lon REAL,
    next_start_at TEXT,
    next_end_at TEXT,
    age_min INTEGER,
    age_label TEXT,
    age_best_from INTEGER,
    age_best_to INTEGER,
    is_free INTEGER DEFAULT 0,
    price_summary TEXT,
    price_min REAL DEFAULT 0,
    price_max REAL DEFAULT 0,
    category_l1 TEXT,
    categories TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    reviews TEXT DEFAULT '[]',
    derisk TEXT DEFAULT '{}',
    rating_avg REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    data TEXT DEFAULT '{}',
    status TEXT DEFAULT 'published',
    created_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX idx_events_category ON events(category_l1);
  CREATE INDEX idx_events_free ON events(is_free);
  CREATE INDEX idx_events_lat_lon ON events(lat, lon);
  CREATE INDEX idx_events_start ON events(next_start_at);
`);

const csvContent = fs.readFileSync(csvPath, 'utf-8');
const records = parse(csvContent, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

function parsePythonList(val: string): string[] {
  if (!val || val === '[]' || val === '') return [];
  try {
    // Try JSON first
    return JSON.parse(val.replace(/'/g, '"'));
  } catch {
    // Extract strings from python-like list
    const matches = val.match(/'([^']+)'/g);
    return matches ? matches.map(m => m.replace(/'/g, '')) : [];
  }
}

function parsePythonDict(val: string): Record<string, unknown> {
  if (!val || val === '{}' || val === '') return {};
  try {
    return JSON.parse(val.replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false').replace(/None/g, 'null'));
  } catch {
    // Try harder with regex for nested structures
    try {
      const cleaned = val
        .replace(/'/g, '"')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/None/g, 'null')
        .replace(/\\n/g, ' ')
        .replace(/\n/g, ' ');
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }
}

function parseReviews(val: string): Array<{ text: string }> {
  const list = parsePythonList(val);
  return list.map(text => ({ text }));
}

function getImageUrl(row: Record<string, string>): string {
  // Try images field first for CDN URLs
  const images = row.images || '';
  const cdnMatch = images.match(/https:\/\/pulse-cdn\.dnogin\.com\/[^'"\s]+/);
  if (cdnMatch) return cdnMatch[0];
  // Fall back to picture_url
  return row.picture_url || '';
}

function getSourceUrl(row: Record<string, string>): string {
  const urls = row.source_urls || '';
  const ticketMatch = urls.match(/'ticket':\s*'([^']+)'/);
  if (ticketMatch) return ticketMatch[1];
  return row.canonical_url || '';
}

const insert = db.prepare(`
  INSERT INTO events (id, title, short_title, tagline, description, source_url, image_url,
    venue_name, subway, address, city, lat, lon, next_start_at, next_end_at,
    age_min, age_label, age_best_from, age_best_to, is_free, price_summary, price_min, price_max,
    category_l1, categories, tags, reviews, derisk, rating_avg, rating_count, data,
    status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

const insertMany = db.transaction((rows: Record<string, string>[]) => {
  for (const row of rows) {
    try {
      if (row.status === 'disabled' || row.disabled === 'True' || row.archived === 'True') {
        skipped++;
        continue;
      }

      const lat = row.lat ? parseFloat(row.lat) : null;
      const lon = row.lon ? parseFloat(row.lon) : null;

      insert.run(
        parseInt(row.id),
        row.title || '',
        row.short_title || '',
        row.tagline || '',
        row.description || '',
        getSourceUrl(row),
        getImageUrl(row),
        row.venue_name || '',
        row.subway || '',
        row.address || '',
        row.city || '',
        lat,
        lon,
        row.next_start_at || '',
        row.next_end_at || '',
        row.age_min ? parseInt(row.age_min) : null,
        row.age_label || '',
        row.age_best_from ? parseInt(row.age_best_from) : null,
        row.age_best_to ? parseInt(row.age_best_to) : null,
        row.is_free === 'True' ? 1 : 0,
        row.price_summary || '',
        row.price_min ? parseFloat(row.price_min) : 0,
        row.price_max ? parseFloat(row.price_max) : 0,
        row.category_l1 || '',
        JSON.stringify(parsePythonList(row.categories || '')),
        JSON.stringify(parsePythonList(row.tags || '')),
        JSON.stringify(parseReviews(row.reviews || '')),
        JSON.stringify(parsePythonDict(row.derisk || '')),
        row.rating_avg ? parseFloat(row.rating_avg) : 0,
        row.rating_count ? parseInt(row.rating_count) : 0,
        JSON.stringify(parsePythonDict(row.data || '')),
        row.status || 'published',
        row.created_at || '',
        row.updated_at || ''
      );
      imported++;
    } catch (e) {
      console.error(`Error importing row ${row.id}: ${(e as Error).message}`);
      skipped++;
    }
  }
});

insertMany(records);

console.log(`Imported: ${imported}, Skipped: ${skipped}`);
console.log(`Database created at: ${dbPath}`);

// Verify
const count = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
console.log(`Total events in DB: ${count.count}`);

const withCoords = db.prepare('SELECT COUNT(*) as count FROM events WHERE lat IS NOT NULL AND lon IS NOT NULL').get() as { count: number };
console.log(`Events with coordinates: ${withCoords.count}`);

const categories = db.prepare("SELECT DISTINCT category_l1 FROM events WHERE category_l1 != '' ORDER BY category_l1").all();
console.log(`Categories: ${categories.map((c: any) => c.category_l1).join(', ')}`);

db.close();
