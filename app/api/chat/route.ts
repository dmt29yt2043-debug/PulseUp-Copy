import OpenAI from 'openai';
import { getEvents, getEventsForChat, getCategories } from '@/lib/db';
import type { FilterState, ChatMessage, UserProfile } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
});

function buildSystemPrompt(): string {
  // Fix 1: Dynamic current date
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Fix 4: Dynamic categories from DB
  let categoryList: string;
  try {
    const cats = getCategories();
    categoryList = cats.map((c) => c.value).join(', ');
  } catch {
    categoryList = 'family, arts, theater, attractions, books, holiday, sports, music, science, film, gaming, community';
  }

  return `You are an event discovery assistant for PulseUp, helping users find activities and events in New York City for families and kids.

TODAY'S DATE: ${today} (${dayOfWeek}). Use this to calculate "this weekend", "tomorrow", "next week", etc. The year is ${now.getFullYear()}.

CRITICAL RESPONSE FORMAT RULES:
- Keep your text response to 1-3 SHORT sentences maximum. The event details are shown as visual cards below your message — do NOT list events in your text.
- Your job is to give a brief, friendly summary like: "I found 6 theater shows coming up! Here are the best picks for your kids." or "Great news — there are free art classes this weekend near you!"
- NEVER list event names, dates, venues, or prices in your text. The cards handle that.
- If no events match, suggest broadening the search in 1-2 sentences.
- If the request is vague, ask ONE short clarifying question.

When a user describes what they're looking for, ALWAYS call the extract_filters function with appropriate filters.

Available categories: ${categoryList}

LOCATION TIPS: When the user mentions a neighborhood or borough (Brooklyn, Midtown, Bronx, etc.), use the "location" filter. This searches venue names, addresses, and city districts.

ACCESSIBILITY: If the user asks about wheelchair access or stroller-friendly events, use the corresponding boolean filters.`;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'extract_filters',
      description: 'Extract event search filters from the user message. Call this to find matching events based on what the user is looking for.',
      parameters: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Event categories to filter by (e.g., "family", "arts", "theater", "attractions", "music", "science", "sports", "holiday")',
          },
          excludeCategories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Event categories to exclude',
          },
          priceMin: {
            type: 'number',
            description: 'Minimum price filter',
          },
          priceMax: {
            type: 'number',
            description: 'Maximum price filter',
          },
          isFree: {
            type: 'boolean',
            description: 'Filter for free events only',
          },
          ageMax: {
            type: 'number',
            description: 'Maximum age for age-appropriate events',
          },
          dateFrom: {
            type: 'string',
            description: 'Start date in ISO format (YYYY-MM-DD). Use today\'s date context to compute relative dates like "this weekend", "tomorrow", etc.',
          },
          dateTo: {
            type: 'string',
            description: 'End date in ISO format (YYYY-MM-DD)',
          },
          search: {
            type: 'string',
            description: 'Free-text search query for specific topics or keywords (e.g., "LEGO", "painting", "dance", "Easter")',
          },
          location: {
            type: 'string',
            description: 'Search by neighborhood, borough, or area name (e.g., "Brooklyn", "Midtown", "Bronx", "Upper Manhattan", "Queens"). Matches against venue names, addresses, and city districts.',
          },
          wheelchairAccessible: {
            type: 'boolean',
            description: 'Filter for wheelchair-accessible venues only',
          },
          strollerFriendly: {
            type: 'boolean',
            description: 'Filter for stroller-friendly venues only',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Mode: parse_children — lightweight LLM call to extract children from free text
    if (body.mode === 'parse_children') {
      const text = body.message as string;
      if (!text) return Response.json({ error: 'Message is required' }, { status: 400 });

      const parseResult = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract children information from the user's text. Return a JSON object with a "children" array.
Detect gender from keywords: daughter/son/girl/boy (also Russian: дочь/сын/девочка/мальчик).
Each child object: { "age": number, "gender": "boy"|"girl"|"unknown", "name": string|null }
If age is unclear, make a reasonable guess. If gender is unclear, use "unknown".
Examples:
- "daughter 6 and son 3" → {"children": [{"age": 6, "gender": "girl", "name": null}, {"age": 3, "gender": "boy", "name": null}]}
- "дочка Маша 5 лет" → {"children": [{"age": 5, "gender": "girl", "name": "Маша"}]}
- "2 kids ages 4 and 7" → {"children": [{"age": 4, "gender": "unknown", "name": null}, {"age": 7, "gender": "unknown", "name": null}]}
Return ONLY the JSON object.`,
          },
          { role: 'user', content: text },
        ],
      });

      const parsed = JSON.parse(parseResult.choices[0].message.content || '{"children": []}');
      // Validate and sanitize
      const children = (parsed.children || []).map((c: Record<string, unknown>) => ({
        age: Math.max(0, Math.min(18, Number(c.age) || 5)),
        gender: ['boy', 'girl', 'unknown'].includes(c.gender as string) ? c.gender : 'unknown',
        name: c.name || null,
        interests: [],
      }));

      return Response.json({ children });
    }

    const { message, filters: existingFilters, history, profile } = body as {
      message: string;
      filters?: FilterState;
      history?: ChatMessage[];
      profile?: UserProfile;
    };

    if (!message) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build conversation messages
    let systemContent = buildSystemPrompt();
    if (profile) {
      // Support both old and new profile shapes
      if ('children' in profile && Array.isArray(profile.children)) {
        const childrenDesc = profile.children.map((c) => {
          const genderEmoji = c.gender === 'girl' ? '👧' : c.gender === 'boy' ? '👦' : '🧒';
          const name = c.name ? ` ${c.name}` : '';
          const interests = c.interests.length > 0 ? ` — interests: ${c.interests.join(', ')}` : '';
          return `${genderEmoji}${name} ${c.age}yo${interests}`;
        }).join('\n');
        const nbDesc = profile.neighborhoods?.length ? profile.neighborhoods.join(', ') : 'Anywhere in NYC';
        const specialDesc = profile.specialNeeds ? `\n- Special needs: ${profile.specialNeeds}` : '';
        systemContent += `\n\nUser profile:\n- Children:\n${childrenDesc}\n- Neighborhoods: ${nbDesc}\n- Budget: ${profile.budget}${specialDesc}\n\nUse this profile to personalize event recommendations.`;
      } else {
        // Legacy profile shape
        const legacy = profile as unknown as { attendees?: string; childAges?: string; interests?: string; budget?: string };
        systemContent += `\n\nUser profile:\n- Attendees: ${legacy.attendees}\n- Child ages: ${legacy.childAges || 'N/A'}\n- Interests: ${legacy.interests}\n- Budget: ${legacy.budget}\n\nUse this profile to personalize event recommendations.`;
      }
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
    ];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Provide event context summary (Fix 5: mixed upcoming + top-rated)
    const eventsSummary = getEventsForChat();
    const contextMessage = `Here is a summary of available events (${eventsSummary.length} shown):\n${eventsSummary
      .map(
        (e) =>
          `- [${e.id}] ${e.title} | ${e.category_l1 || 'general'} | ${e.venue_name} | ${e.city || ''}${e.address ? ', ' + e.address : ''} | ${e.next_start_at} | ${e.is_free ? 'Free' : e.price_summary} | ${e.age_label}`
      )
      .join('\n')}`;

    messages.push({
      role: 'system',
      content: contextMessage,
    });

    // Add current user message (no old filters — each query starts fresh)
    messages.push({
      role: 'user',
      content: message,
    });

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0].message;

    let extractedFilters: FilterState = {};
    let responseText = responseMessage.content || '';

    // Check if the model called the extract_filters function
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Find the extract_filters call
      for (const tc of responseMessage.tool_calls) {
        if (tc.type === 'function' && tc.function.name === 'extract_filters') {
          try {
            extractedFilters = JSON.parse(tc.function.arguments) as FilterState;
          } catch {
            // If parsing fails, use empty filters
          }
        }
      }

      // Get events with extracted filters
      const eventsResult = getEvents({ ...extractedFilters, page: 1, page_size: 10 });

      // Build tool responses for ALL tool_calls (OpenAI requires this)
      const toolResponses: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        responseMessage.tool_calls
          .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function')
          .map((tc) => ({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: tc.function.name === 'extract_filters'
              ? JSON.stringify({
                  total: eventsResult.total,
                  events: eventsResult.events.map((e) => ({
                    id: e.id,
                    title: e.title,
                    tagline: e.tagline,
                    venue_name: e.venue_name,
                    next_start_at: e.next_start_at,
                    is_free: e.is_free,
                    price_summary: e.price_summary,
                    age_label: e.age_label,
                    rating_avg: e.rating_avg,
                  })),
                })
              : JSON.stringify({ result: 'ok' }),
          }));

      // Call OpenAI again with all tool results to get a natural language response
      const followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...messages,
        responseMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam,
        ...toolResponses,
      ];

      const followUp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: followUpMessages,
      });

      responseText = followUp.choices[0].message.content || '';

      return Response.json({
        message: responseText,
        filters: extractedFilters,
        events: eventsResult.events,
      });
    }

    // If no tool call, return just the text response with existing filters
    const eventsResult = existingFilters
      ? getEvents({ ...existingFilters, page: 1, page_size: 10 })
      : { events: [], total: 0 };

    return Response.json({
      message: responseText,
      filters: existingFilters || {},
      events: eventsResult.events,
    });
  } catch (error) {
    console.error('Error in chat:', error);
    return Response.json({ error: 'Failed to process chat message' }, { status: 500 });
  }
}
