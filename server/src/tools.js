import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_DIR = path.resolve(__dirname, '../knowledge');

/**
 * In-memory cache of business knowledge documents
 */
let knowledgeCache = null;

function loadKnowledgeBase() {
  if (knowledgeCache) return knowledgeCache;

  const docs = [];
  try {
    if (fs.existsSync(KNOWLEDGE_DIR)) {
      const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(KNOWLEDGE_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        docs.push({
          filename: file,
          name: file.replace('.md', ''),
          content
        });
      }
    }
  } catch (err) {
    console.error('[KnowledgeBase] Failed to read knowledge directory:', err.message);
  }

  knowledgeCache = docs;
  return docs;
}

const STOP_WORDS = new Set([
  'bella', 'vista', 'italian', 'kitchen', 'restaurant', 'what', 'where', 'when',
  'how', 'are', 'the', 'for', 'and', 'our', 'you', 'your', 'can', 'good',
  'popular', 'dishes', 'dish', 'please', 'tell', 'about', 'some'
]);

/**
 * Tier 2: Business Knowledge Base Search
 * Scans local /knowledge documents for relevant sections.
 */
export function searchKnowledgeBase({ query }) {
  const docs = loadKnowledgeBase();
  if (!docs.length) {
    return 'No business documents found in knowledge base.';
  }

  const rawTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const filteredTerms = rawTerms.filter(w => !STOP_WORDS.has(w));
  const queryTerms = filteredTerms.length > 0 ? filteredTerms : rawTerms;

  const scoredSections = [];

  for (const doc of docs) {
    const sections = doc.content.split(/\n(?=##?\s)/);
    for (const section of sections) {
      if (section.startsWith('# ') && !section.startsWith('## ')) continue;
      const lowerSection = section.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (lowerSection.includes(term)) {
          score += 3;
        }
      }

      if (score > 0) {
        scoredSections.push({
          doc: doc.name,
          score,
          text: section.trim()
        });
      }
    }
  }

  scoredSections.sort((a, b) => b.score - a.score);

  if (scoredSections.length === 0) {
    // Return summary of all documents if no specific match
    return docs.map(d => `--- ${d.name.toUpperCase()} ---\n${d.content.slice(0, 400)}...`).join('\n\n');
  }

  const topMatches = scoredSections.slice(0, 3).map(s => `[Source: ${s.doc}]\n${s.text}`).join('\n\n');
  return topMatches;
}

/**
 * Tier 3: Real-Time Live Web Search
 * Fetches time-sensitive results via DuckDuckGo HTML / Instant Answers.
 */
export async function webSearch({ query, signal }) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>(.*?)<\/a>/gs)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    if (snippets.length === 0) {
      return `No live web results found for "${query}".`;
    }

    return snippets.map((s, i) => `${i + 1}. ${s}`).join('\n');
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    console.warn(`[WebSearch] Search failed for "${query}": ${err.message}`);
    return `Live web search temporarily unavailable for "${query}".`;
  }
}

/**
 * Tool definitions compatible with OpenAI / Groq Function Calling
 */
export const ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search official business information for Bella Vista Italian Kitchen (hours, menus, pricing, dress code, dietary options, policies, location, and parking). Call this whenever the user asks about the restaurant.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query regarding the restaurant (e.g. "dinner hours", "vegan options", "corkage policy", "parking")'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web for current events, today\'s weather, sports scores, or time-sensitive real-time information that cannot be answered from general training knowledge.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query for live/current information (e.g. "weather in San Francisco today", "latest news")'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'make_reservation',
      description: 'Create or update table reservation details at Bella Vista. Call ONLY when the user expresses clear intent to book or modify a reservation.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Reservation date (e.g. "Tomorrow", "Tonight", "Friday", "2026-09-12")'
          },
          time: {
            type: 'string',
            description: 'Reservation time (e.g. "7:00 PM", "8:30 PM", "6 PM")'
          },
          party_size: {
            type: 'integer',
            description: 'Number of dining guests (e.g. 2, 4, 7)'
          },
          guest_name: {
            type: 'string',
            description: 'Name for the reservation'
          }
        }
      }
    }
  }
];

/**
 * Executes a tool invocation and returns string output for the LLM
 */
export async function executeToolCall({ name, args, bookingSession, signal }) {
  console.log(`[ToolCall] 🛠️ Executing: ${name}(${JSON.stringify(args)})`);

  if (name === 'search_knowledge_base') {
    return searchKnowledgeBase({ query: args.query || '' });
  }

  if (name === 'web_search') {
    return await webSearch({ query: args.query || '', signal });
  }

  if (name === 'make_reservation') {
    const partial = {};
    if (args.date) partial.date = args.date;
    if (args.time) partial.time = args.time;
    if (args.party_size) partial.partySize = Number(args.party_size);
    if (args.guest_name) partial.name = args.guest_name;

    const updated = bookingSession.stageUpdate(partial);
    const committed = bookingSession.commitStaged();

    const missing = [];
    if (!committed.date) missing.push('date');
    if (!committed.time) missing.push('time');
    if (!committed.partySize) missing.push('party size');
    if (!committed.name) missing.push('name');

    return JSON.stringify({
      status: missing.length === 0 ? 'confirmed' : 'in_progress',
      current_reservation: committed,
      missing_fields: missing,
      message: missing.length === 0
        ? `Reservation successfully confirmed for ${committed.partySize} guests at ${committed.time} on ${committed.date} under ${committed.name}.`
        : `Reservation details staged. Still missing: ${missing.join(', ')}.`
    });
  }

  return `Error: Unknown tool "${name}"`;
}
