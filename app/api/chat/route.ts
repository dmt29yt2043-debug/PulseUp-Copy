import OpenAI from 'openai';
import { getEvents, getEventsForChat } from '@/lib/db';
import type { FilterState, ChatMessage, UserProfile } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
});

const SYSTEM_PROMPT = `You are an event discovery assistant for PulseUp, helping users find activities and events in New York City for families and kids.

When a user describes what they're looking for, you should:
1. Understand their preferences (category, age range, budget, dates, location, etc.)
2. Extract structured filters from their message
3. Provide a helpful, conversational response about what you found

Always be friendly, concise, and helpful. If the user's request is vague, ask clarifying questions.
Focus on matching events to what the user wants - consider age appropriateness, budget, interests, and timing.

Available categories: family, arts, theater, attractions, books, holiday, sports, Art, Children's Activities

When extracting filters, use these field names:
- categories: array of category strings to include
- excludeCategories: array of category strings to exclude
- priceMin: minimum price (number)
- priceMax: maximum price (number)
- isFree: true if user wants free events only
- ageMax: maximum age the user mentioned (to find age-appropriate events)
- dateFrom: ISO date string for start of date range
- dateTo: ISO date string for end of date range
- search: text search query for specific topics/keywords`;

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
            description: 'Event categories to filter by (e.g., "family", "arts", "theater", "attractions", "books", "holiday", "sports")',
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
            description: 'Start date in ISO format (YYYY-MM-DD)',
          },
          dateTo: {
            type: 'string',
            description: 'End date in ISO format (YYYY-MM-DD)',
          },
          search: {
            type: 'string',
            description: 'Free-text search query for specific topics or keywords',
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
    let systemContent = SYSTEM_PROMPT;
    if (profile) {
      systemContent += `\n\nUser profile:\n- Attendees: ${profile.attendees}\n- Child ages: ${profile.childAges || 'N/A'}\n- Interests: ${profile.interests}\n- Budget preference: ${profile.budget}\n\nUse this profile to personalize event recommendations.`;
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

    // Provide event context summary
    const eventsSummary = getEventsForChat();
    const contextMessage = `Here is a summary of available events:\n${eventsSummary
      .map(
        (e) =>
          `- [${e.id}] ${e.title} | ${e.category_l1} | ${e.venue_name} | ${e.next_start_at} | ${e.is_free ? 'Free' : e.price_summary} | ${e.age_label}`
      )
      .join('\n')}`;

    messages.push({
      role: 'system',
      content: contextMessage,
    });

    // Add current user message
    if (existingFilters) {
      messages.push({
        role: 'user',
        content: `${message}\n\n(Current active filters: ${JSON.stringify(existingFilters)})`,
      });
    } else {
      messages.push({
        role: 'user',
        content: message,
      });
    }

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
        responseMessage.tool_calls.map((tc) => ({
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
