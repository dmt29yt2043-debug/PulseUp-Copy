/**
 * Chat Relevance Evaluation Script
 *
 * Tests 25 real-world NYC parent queries against our chat pipeline,
 * uses GPT-4o as a judge to score relevance, and diagnoses whether
 * problems are in the database or the pipeline.
 *
 * Usage: npx tsx scripts/eval-chat.ts
 */

import OpenAI from 'openai';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// ─── Config ───
const DB_PATH = path.join(process.cwd(), 'data', 'events.db');
const SCENARIOS_PATH = path.join(process.cwd(), 'scripts', 'eval-scenarios.json');
const RESULTS_PATH = path.join(process.cwd(), 'reports', 'eval-results.json');
const SUMMARY_PATH = path.join(process.cwd(), 'reports', 'eval-summary.md');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Types ───
interface ChildProfile {
  age: number;
  gender: string;
  name?: string;
  interests: string[];
}

interface UserProfile {
  children: ChildProfile[];
  neighborhoods: string[];
  budget: string;
  specialNeeds?: string;
}

interface Scenario {
  id: number;
  category: string;
  query: string;
  expectedIntent: string;
}

interface EvalResult {
  id: number;
  category: string;
  query: string;
  expectedIntent: string;
  extractedFilters: Record<string, unknown>;
  eventsReturned: number;
  topEvents: string[];
  chatResponse: string;
  // Broader search to check if DB has relevant events
  broaderSearchCount: number;
  broaderSearchTopEvents: string[];
  // Judge scores
  relevanceScore: number;
  completenessScore: number;
  ageFitScore: number;
  diagnosis: 'db_gap' | 'pipeline_issue' | 'good_match' | 'partial_match';
  judgeExplanation: string;
}

// ─── DB Helpers ───
function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

function getAllPublishedEvents(db: Database.Database): Array<Record<string, unknown>> {
  return db.prepare(`
    SELECT id, title, category_l1, tagline, venue_name, next_start_at, is_free,
           price_summary, price_min, price_max, age_min, age_label, age_best_from, age_best_to,
           description, tags, city, address, lat, lon, data
    FROM events
    WHERE status = 'published'
      AND title NOT LIKE '%Rewards%'
      AND title NOT LIKE '%Royalty%'
      AND title NOT LIKE '%Loyalty%'
    ORDER BY next_start_at ASC
  `).all() as Array<Record<string, unknown>>;
}

function searchEvents(db: Database.Database, keyword: string): Array<Record<string, unknown>> {
  const param = `%${keyword}%`;
  return db.prepare(`
    SELECT id, title, category_l1, tagline, venue_name, next_start_at, is_free,
           price_summary, age_label, city, lat, lon
    FROM events
    WHERE status = 'published'
      AND (title LIKE ? OR description LIKE ? OR tagline LIKE ? OR tags LIKE ?)
    ORDER BY next_start_at ASC
    LIMIT 20
  `).all(param, param, param, param) as Array<Record<string, unknown>>;
}

// ─── Chat Pipeline (direct, no HTTP) ───
function buildSystemPrompt(): string {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  return `You are an event discovery assistant for PulseUp, helping users find activities and events in New York City for families and kids.

TODAY'S DATE: ${today} (${dayOfWeek}). Use this to calculate "this weekend", "tomorrow", "next week", etc. The year is ${now.getFullYear()}.

When a user describes what they're looking for, ALWAYS call the extract_filters function.
Keep your text response to 1-3 SHORT sentences.

Available categories: family, arts, theater, attractions, books, holiday, sports, Art, Children's Activities, music, science, film, gaming, community

LOCATION TIPS: When the user mentions a neighborhood or borough (Brooklyn, Midtown, Bronx, etc.), use the "location" filter.
ACCESSIBILITY: If the user asks about wheelchair access or stroller-friendly events, use the corresponding boolean filters.`;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'extract_filters',
      description: 'Extract event search filters from the user message.',
      parameters: {
        type: 'object',
        properties: {
          categories: { type: 'array', items: { type: 'string' } },
          excludeCategories: { type: 'array', items: { type: 'string' } },
          priceMin: { type: 'number' },
          priceMax: { type: 'number' },
          isFree: { type: 'boolean' },
          ageMax: { type: 'number' },
          dateFrom: { type: 'string', description: 'Start date ISO YYYY-MM-DD. Use today context.' },
          dateTo: { type: 'string', description: 'End date ISO YYYY-MM-DD.' },
          search: { type: 'string', description: 'Free-text keyword search' },
          location: { type: 'string', description: 'Neighborhood/borough name (Brooklyn, Midtown, Bronx, etc.)' },
          wheelchairAccessible: { type: 'boolean', description: 'Wheelchair-accessible venues only' },
          strollerFriendly: { type: 'boolean', description: 'Stroller-friendly venues only' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

async function runChatQuery(
  query: string,
  profile: UserProfile,
  allEvents: Array<Record<string, unknown>>,
): Promise<{ message: string; filters: Record<string, unknown>; events: Array<Record<string, unknown>> }> {
  // Build context
  let systemContent = buildSystemPrompt();
  const childrenDesc = profile.children
    .map((c) => `${c.gender === 'girl' ? '👧' : c.gender === 'boy' ? '👦' : '🧒'} ${c.name || ''} ${c.age}yo — interests: ${c.interests.join(', ')}`)
    .join('\n');
  systemContent += `\n\nUser profile:\n- Children:\n${childrenDesc}\n- Neighborhoods: ${profile.neighborhoods.join(', ')}\n- Budget: ${profile.budget}`;

  // Event context (first 100)
  const eventContext = allEvents.slice(0, 100).map(
    (e) => `- [${e.id}] ${e.title} | ${e.category_l1 || 'uncategorized'} | ${e.venue_name} | ${e.next_start_at} | ${e.is_free ? 'Free' : e.price_summary} | ${e.age_label}`
  ).join('\n');

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    { role: 'system', content: `Available events:\n${eventContext}` },
    { role: 'user', content: query },
  ];

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto',
  });

  const responseMessage = completion.choices[0].message;
  let extractedFilters: Record<string, unknown> = {};
  let responseText = responseMessage.content || '';

  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    for (const tc of responseMessage.tool_calls) {
      if (tc.function.name === 'extract_filters') {
        try {
          extractedFilters = JSON.parse(tc.function.arguments);
        } catch { /* ignore */ }
      }
    }
  }

  // Apply filters to get matching events
  let matchingEvents = [...allEvents];

  if (extractedFilters.categories && (extractedFilters.categories as string[]).length > 0) {
    const cats = extractedFilters.categories as string[];
    matchingEvents = matchingEvents.filter((e) =>
      cats.some((c) => e.category_l1 === c || (e.tags as string || '').toLowerCase().includes(c.toLowerCase()))
    );
  }

  if (extractedFilters.isFree) {
    matchingEvents = matchingEvents.filter((e) => e.is_free);
  }

  if (extractedFilters.priceMax !== undefined) {
    const max = extractedFilters.priceMax as number;
    matchingEvents = matchingEvents.filter((e) => !e.price_min || (e.price_min as number) <= max);
  }

  if (extractedFilters.ageMax !== undefined) {
    const maxAge = extractedFilters.ageMax as number;
    matchingEvents = matchingEvents.filter((e) => !e.age_min || (e.age_min as number) <= maxAge);
  }

  if (extractedFilters.search) {
    const s = (extractedFilters.search as string).toLowerCase();
    matchingEvents = matchingEvents.filter((e) =>
      (e.title as string || '').toLowerCase().includes(s) ||
      (e.tagline as string || '').toLowerCase().includes(s) ||
      (e.description as string || '').toLowerCase().includes(s) ||
      (e.tags as string || '').toLowerCase().includes(s)
    );
  }

  if (extractedFilters.location) {
    const loc = (extractedFilters.location as string).toLowerCase();
    matchingEvents = matchingEvents.filter((e) =>
      (e.venue_name as string || '').toLowerCase().includes(loc) ||
      (e.address as string || '').toLowerCase().includes(loc) ||
      (e.city as string || '').toLowerCase().includes(loc)
    );
  }

  if (extractedFilters.wheelchairAccessible) {
    matchingEvents = matchingEvents.filter((e) => {
      const data = e.data as string || '';
      return data.includes('wheelchair_accessible') && data.includes('true');
    });
  }

  if (extractedFilters.strollerFriendly) {
    matchingEvents = matchingEvents.filter((e) => {
      const data = e.data as string || '';
      return data.includes('stroller_friendly') && data.includes('true');
    });
  }

  return {
    message: responseText,
    filters: extractedFilters,
    events: matchingEvents.slice(0, 10),
  };
}

// ─── Judge (GPT-4o) ───
async function judgeResult(
  scenario: Scenario,
  profile: UserProfile,
  result: { message: string; filters: Record<string, unknown>; events: Array<Record<string, unknown>> },
  broaderEvents: Array<Record<string, unknown>>,
): Promise<{
  relevanceScore: number;
  completenessScore: number;
  ageFitScore: number;
  diagnosis: 'db_gap' | 'pipeline_issue' | 'good_match' | 'partial_match';
  explanation: string;
}> {
  const eventList = result.events.map((e) =>
    `- ${e.title} | ${e.venue_name} | ${e.next_start_at} | ${e.is_free ? 'Free' : e.price_summary} | ${e.age_label || 'no age info'}`
  ).join('\n') || '(no events returned)';

  const broaderList = broaderEvents.slice(0, 10).map((e) =>
    `- ${e.title} | ${e.category_l1 || 'uncategorized'} | ${e.age_label || 'no age'}`
  ).join('\n') || '(no broader events found)';

  const judgePrompt = `You are evaluating a family event discovery chatbot for NYC parents.

USER PROFILE:
- Children: ${profile.children.map((c) => `${c.name || 'child'} ${c.age}yo (${c.gender}), interests: ${c.interests.join(', ')}`).join('; ')}
- Neighborhoods: ${profile.neighborhoods.join(', ')}
- Budget: ${profile.budget}

USER QUERY: "${scenario.query}"
EXPECTED INTENT: ${scenario.expectedIntent}

EXTRACTED FILTERS: ${JSON.stringify(result.filters)}

EVENTS RETURNED (${result.events.length}):
${eventList}

BROADER DATABASE SEARCH (what exists if we remove most filters):
${broaderList}

CHATBOT RESPONSE: "${result.message}"

Rate on 1-5 scale:
1. RELEVANCE: How relevant are the returned events to the user's query? (1=completely wrong, 5=perfect match)
2. COMPLETENESS: Did the system find all relevant events it could? (1=missed everything, 5=found all available)
3. AGE_FIT: Are events age-appropriate for the user's children (ages ${profile.children.map((c) => c.age).join(', ')})? (1=wrong ages, 5=perfect fit)

DIAGNOSIS (pick one):
- "good_match": Events are relevant and the system worked well
- "partial_match": Some relevant events found but could be better
- "pipeline_issue": Relevant events EXIST in the database but the system didn't find them (wrong filters, missed keywords, etc.)
- "db_gap": No relevant events exist in the database for this query

Respond ONLY with valid JSON:
{
  "relevanceScore": <1-5>,
  "completenessScore": <1-5>,
  "ageFitScore": <1-5>,
  "diagnosis": "<good_match|partial_match|pipeline_issue|db_gap>",
  "explanation": "<1-2 sentences explaining the score>"
}`;

  const judgeResult = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: judgePrompt }],
  });

  try {
    return JSON.parse(judgeResult.choices[0].message.content || '{}');
  } catch {
    return {
      relevanceScore: 1,
      completenessScore: 1,
      ageFitScore: 1,
      diagnosis: 'pipeline_issue' as const,
      explanation: 'Judge failed to respond properly',
    };
  }
}

// ─── Generate Summary ───
function generateSummary(results: EvalResult[]): string {
  const avgRelevance = (results.reduce((s, r) => s + r.relevanceScore, 0) / results.length).toFixed(1);
  const avgCompleteness = (results.reduce((s, r) => s + r.completenessScore, 0) / results.length).toFixed(1);
  const avgAgeFit = (results.reduce((s, r) => s + r.ageFitScore, 0) / results.length).toFixed(1);

  const diagCounts = { good_match: 0, partial_match: 0, pipeline_issue: 0, db_gap: 0 };
  results.forEach((r) => { diagCounts[r.diagnosis]++; });

  // By category
  const categories = [...new Set(results.map((r) => r.category))];
  const byCategory = categories.map((cat) => {
    const catResults = results.filter((r) => r.category === cat);
    const avg = (catResults.reduce((s, r) => s + r.relevanceScore, 0) / catResults.length).toFixed(1);
    return { category: cat, avgRelevance: avg, count: catResults.length };
  });

  // Failures
  const failures = results.filter((r) => r.relevanceScore <= 2);
  const pipelineIssues = results.filter((r) => r.diagnosis === 'pipeline_issue');
  const dbGaps = results.filter((r) => r.diagnosis === 'db_gap');

  let md = `# Chat Relevance Evaluation Report\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Scenarios tested:** ${results.length}\n\n`;

  md += `## Overall Scores\n\n`;
  md += `| Metric | Score (1-5) |\n|--------|------------|\n`;
  md += `| Relevance | **${avgRelevance}** |\n`;
  md += `| Completeness | **${avgCompleteness}** |\n`;
  md += `| Age Appropriateness | **${avgAgeFit}** |\n\n`;

  md += `## Diagnosis Breakdown\n\n`;
  md += `| Diagnosis | Count | % |\n|-----------|-------|---|\n`;
  Object.entries(diagCounts).forEach(([k, v]) => {
    md += `| ${k} | ${v} | ${((v / results.length) * 100).toFixed(0)}% |\n`;
  });

  md += `\n## Scores by Category\n\n`;
  md += `| Category | Avg Relevance | Queries |\n|----------|--------------|--------|\n`;
  byCategory.forEach((c) => {
    md += `| ${c.category} | ${c.avgRelevance} | ${c.count} |\n`;
  });

  if (failures.length > 0) {
    md += `\n## Failures (Relevance ≤ 2)\n\n`;
    failures.forEach((f) => {
      md += `### Q${f.id}: "${f.query}"\n`;
      md += `- **Diagnosis:** ${f.diagnosis}\n`;
      md += `- **Filters extracted:** \`${JSON.stringify(f.extractedFilters)}\`\n`;
      md += `- **Events returned:** ${f.eventsReturned}\n`;
      md += `- **Judge:** ${f.judgeExplanation}\n\n`;
    });
  }

  if (pipelineIssues.length > 0) {
    md += `\n## Pipeline Issues (events exist but weren't found)\n\n`;
    pipelineIssues.forEach((p) => {
      md += `- **Q${p.id}:** "${p.query}" — ${p.judgeExplanation}\n`;
    });
  }

  if (dbGaps.length > 0) {
    md += `\n## Database Gaps (no relevant events exist)\n\n`;
    dbGaps.forEach((d) => {
      md += `- **Q${d.id}:** "${d.query}" — ${d.judgeExplanation}\n`;
    });
  }

  md += `\n## All Results\n\n`;
  md += `| # | Query | Relevance | Diagnosis | Events | Top Event |\n`;
  md += `|---|-------|-----------|-----------|--------|----------|\n`;
  results.forEach((r) => {
    const topEvent = r.topEvents[0] || 'none';
    md += `| ${r.id} | ${r.query.substring(0, 40)} | ${r.relevanceScore}/5 | ${r.diagnosis} | ${r.eventsReturned} | ${topEvent.substring(0, 35)} |\n`;
  });

  return md;
}

// ─── Main ───
async function main() {
  console.log('🧪 Starting Chat Relevance Evaluation...\n');

  // Load scenarios
  const scenarioData = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf-8'));
  const profile: UserProfile = scenarioData.profile;
  const scenarios: Scenario[] = scenarioData.scenarios;

  // Load all events from DB
  const db = getDb();
  const allEvents = getAllPublishedEvents(db);
  console.log(`📊 Database: ${allEvents.length} published events\n`);

  const results: EvalResult[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`  [${scenario.id}/${scenarios.length}] "${scenario.query}" ... `);

    try {
      // Run chat query
      const result = await runChatQuery(scenario.query, profile, allEvents);

      // Broader search (keywords from query)
      const keywords = scenario.query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      let broaderEvents: Array<Record<string, unknown>> = [];
      for (const kw of keywords) {
        const found = searchEvents(db, kw);
        broaderEvents = [...broaderEvents, ...found];
      }
      // Deduplicate
      const seen = new Set<number>();
      broaderEvents = broaderEvents.filter((e) => {
        const id = e.id as number;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // Judge
      const judgment = await judgeResult(scenario, profile, result, broaderEvents);

      const evalResult: EvalResult = {
        id: scenario.id,
        category: scenario.category,
        query: scenario.query,
        expectedIntent: scenario.expectedIntent,
        extractedFilters: result.filters,
        eventsReturned: result.events.length,
        topEvents: result.events.slice(0, 3).map((e) => e.title as string),
        chatResponse: result.message,
        broaderSearchCount: broaderEvents.length,
        broaderSearchTopEvents: broaderEvents.slice(0, 3).map((e) => e.title as string),
        relevanceScore: judgment.relevanceScore,
        completenessScore: judgment.completenessScore,
        ageFitScore: judgment.ageFitScore,
        diagnosis: judgment.diagnosis,
        judgeExplanation: judgment.explanation,
      };

      results.push(evalResult);

      const emoji = judgment.relevanceScore >= 4 ? '✅' : judgment.relevanceScore >= 3 ? '🟡' : '❌';
      console.log(`${emoji} ${judgment.relevanceScore}/5 [${judgment.diagnosis}]`);
    } catch (err) {
      console.log(`❌ ERROR: ${err}`);
      results.push({
        id: scenario.id,
        category: scenario.category,
        query: scenario.query,
        expectedIntent: scenario.expectedIntent,
        extractedFilters: {},
        eventsReturned: 0,
        topEvents: [],
        chatResponse: '',
        broaderSearchCount: 0,
        broaderSearchTopEvents: [],
        relevanceScore: 0,
        completenessScore: 0,
        ageFitScore: 0,
        diagnosis: 'pipeline_issue',
        judgeExplanation: `Error: ${err}`,
      });
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  // Save results
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to ${RESULTS_PATH}`);

  // Generate summary
  const summary = generateSummary(results);
  fs.writeFileSync(SUMMARY_PATH, summary);
  console.log(`📊 Summary saved to ${SUMMARY_PATH}`);

  // Print quick summary
  const avg = (results.reduce((s, r) => s + r.relevanceScore, 0) / results.length).toFixed(1);
  const good = results.filter((r) => r.diagnosis === 'good_match').length;
  const partial = results.filter((r) => r.diagnosis === 'partial_match').length;
  const pipeline = results.filter((r) => r.diagnosis === 'pipeline_issue').length;
  const dbGap = results.filter((r) => r.diagnosis === 'db_gap').length;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  OVERALL RELEVANCE: ${avg}/5`);
  console.log(`  ✅ Good match: ${good}  🟡 Partial: ${partial}  🔧 Pipeline: ${pipeline}  📭 DB gap: ${dbGap}`);
  console.log(`${'═'.repeat(50)}\n`);

  db.close();
}

main().catch(console.error);
