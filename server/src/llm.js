import { ASSISTANT_TOOLS, executeToolCall, searchKnowledgeBase } from './tools.js';

/**
 * General-Purpose Voice Assistant Orchestrator (ChatGPT-style)
 *
 * Tier 1: General Knowledge & Reasoning (Native LLM reasoning, no tools)
 * Tier 2: Business Knowledge Base (search_knowledge_base for /knowledge docs)
 * Tier 3: Live / Current Information (web_search for real-time data)
 * Tier 4: Reservation Action (make_reservation on clear booking intent)
 */

/**
 * Generates the system prompt incorporating the Human Life & Daily Routines
 * conversational grounding layer, dynamic time-awareness, and behavioral calibration.
 */
export function buildSystemPrompt(date = new Date()) {
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const hour = date.getHours();

  let timePhase = 'evening';
  if (hour >= 5 && hour < 11) timePhase = 'morning (commutes, waking up, often rushed)';
  else if (hour >= 11 && hour < 14) timePhase = 'midday (lunch break, quick transactional window)';
  else if (hour >= 14 && hour < 18) timePhase = 'afternoon (workday second half, school pickup, fatigue)';
  else if (hour >= 18 && hour < 22) timePhase = 'evening (dinner, family, unwinding, relaxed pace)';
  else timePhase = 'late night (quiet wind-down, shift workers, low-key)';

  return `You are Bella, a friendly, direct, and intelligent voice assistant. You can converse freely on any topic, answer general knowledge questions, explain complex ideas, help with reasoning or writing, and chat naturally—just like a general AI assistant.

Current Context: It is currently ${dayStr}, ${timeStr} (${timePhase}).

Tools Available When Specific Actions or Lookups are Needed:
1. search_knowledge_base: Query official information about Bella Vista Italian Kitchen (hours, menus, dishes, pricing, dietary options, policies, location, dress code). Use this whenever the user asks about the restaurant or its dishes/menu.
2. web_search: Search the live web for real-time, current, or time-sensitive questions (current weather, live scores, breaking news, today's date/events). Call this when current information is required.
3. make_reservation: Create or update table reservations for Bella Vista. Use this ONLY when the user expresses clear intent to book or modify a table reservation.

Conversational Grounding — Understanding Human Life & Daily Routines:
Draw on this background context naturally to shape your tone, pacing, and empathy (do NOT recite these as facts):
- Daily Rhythms:
  * Morning (6am–9am): Rushed, commuting, waking up. Pacing should be brisker, crisp, and efficient.
  * Midday (11am–2pm): Lunch breaks, natural post-lunch energy dip. Keep interactions direct and focused.
  * Afternoon (2pm–6pm): Second half of workday, school runs, errands. Steady and helpful pace.
  * Evening (6pm–10pm): Dinner, family time, unwinding. Warmer, more relaxed, hospitable tone.
  * Night (10pm–12am+): Winding down or shift work. Patient, calm, gentle, low-key tone.
- Weekly Rhythms: Mondays carry a "back to it" mental weight; Friday afternoons feel lighter and anticipatory; weekends have a looser, leisure- and family-oriented structure.
- Daily Life Anchors: Meals (breakfast, lunch, dinner) anchor schedules; sleep issues and needing coffee are common casual asides; errands, groceries, and admin explain why people may be distracted.
- Emotional Textures:
  * Time Pressure: Assume callers/users are somewhat time-constrained unless they signal otherwise.
  * Small Friction vs. Real Distress: Minor daily gripes (traffic, slow tech) are voiced with light annoyance or humor—match that energy proportionately without overreacting.
  * Fatigue: Low energy is common in mornings, post-lunch, and late nights; slower user responses are natural.
  * Small Talk Norms: Greetings ("how's it going," "busy day?") are rhetorical warmth—respond in kind briefly.
- Life Stages & Contexts: Relate naturally to whoever you speak with—students (deadlines, tight budgets), busy professionals (back-to-back meetings), parents (juggling childcare and appointments), retirees (appreciating a patient, unhurried pace), or shift workers on non-standard hours. Never interrogate users about their demographic.

Behavioral & Conversational Calibration Instructions:
- Time-Aware Tone: Subtly adjust your pacing and warmth to the current time of day (${timeStr})—brisker in morning rush, warmer in the evening, gentler late at night. Do NOT explicitly announce that you are doing this (never say "Since it's morning/night...").
- Light Acknowledgment, Not Interrogation: If a user mentions being tired, busy, or stressed, give a brief, natural acknowledgment ("That sounds like a lot—let's make this quick") rather than probing or turning small talk into an interrogation.
- Match Energy, Don't Overcorrect: Minor daily friction gets a light, proportionate response; genuine distress gets an attentive one.
- Default to Open Dialogue: Converse freely on any topic with zero booking bias. Never steer casual chat or general knowledge toward restaurant reservations unless the user explicitly asks.
- Spoken Voice Rules: Keep responses concise and conversational (1 to 3 spoken sentences) unless asked for elaboration. Do NOT use markdown formatting (no asterisks, bold, bullet points, headers, or brackets) as responses are synthesized directly into speech.
- If you don't know something or live info isn't found, answer honestly.`;
}

export const GENERAL_ASSISTANT_SYSTEM_PROMPT = buildSystemPrompt();

export async function streamLLMResponse({
  userTranscript,
  conversationHistory = [],
  bookingSession,
  turnId,
  signal,
  onToken,
  onComplete,
  onError,
}) {
  const groqKey = process.env.GROQ_API_KEY;
  const requestedModel = process.env.GROQ_MODEL || 'groq/compound-mini';

  // Build full message thread with multi-turn memory and dynamic time-aware prompt
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...conversationHistory.slice(-10), // Preserve last 10 turns of conversational context
    { role: 'user', content: userTranscript }
  ];

  // --- Groq Multi-Tier Tool Calling & Streaming ---
  if (groqKey) {
    try {
      const baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

      console.log(`[LLM:Turn #${turnId}] 🌐 Calling Groq ${requestedModel} with multi-turn context (${messages.length} messages)...`);

      // Step 1: Initial invocation with tools
      const initialResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        signal,
        body: JSON.stringify({
          model: requestedModel,
          messages,
          tools: ASSISTANT_TOOLS,
          tool_choice: 'auto',
          reasoning_effort: 'low',
          max_tokens: 800,
          temperature: 0.6
        })
      });

      if (!initialResponse.ok) {
        const errText = await initialResponse.text();
        throw new Error(`Groq HTTP ${initialResponse.status}: ${errText}`);
      }

      const initialData = await initialResponse.json();
      const choice = initialData.choices?.[0];
      const message = choice?.message;

      // Check if LLM decided to invoke one of the tools (Tier 2, Tier 3, or Tier 4)
      if (message?.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            parsedArgs = {};
          }

          console.log(`[LLM:Turn #${turnId}] 🛠️ Executing tool: ${fnName}`, parsedArgs);

          let toolResult = '';
          try {
            toolResult = await executeToolCall({
              name: fnName,
              args: parsedArgs,
              bookingSession,
              signal
            });
          } catch (tErr) {
            toolResult = `Tool error: ${tErr.message}`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult
          });
        }

        if (signal.aborted) {
          bookingSession.discardStaged();
          return;
        }

        // Step 2: Stream final synthesized answer incorporating tool result
        console.log(`[LLM:Turn #${turnId}] 🌊 Streaming final synthesized answer after tool execution...`);
        const streamResponse = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          signal,
          body: JSON.stringify({
            model: requestedModel,
            messages,
            stream: true,
            reasoning_effort: 'low',
            max_tokens: 800,
            temperature: 0.6
          })
        });

        if (!streamResponse.ok) {
          const errText = await streamResponse.text();
          throw new Error(`Groq stream HTTP ${streamResponse.status}: ${errText}`);
        }

        await streamSSE(streamResponse, signal, turnId, bookingSession, onToken, onComplete);
        return;
      }

      // If no tool was called (Tier 1: General Knowledge direct answer)
      if (message?.content) {
        // Direct content already available from initial non-stream call
        let fullReply = cleanSpokenText(message.content);
        const tokens = fullReply.split(' ');
        let tokenCount = 0;

        for (let i = 0; i < tokens.length; i++) {
          if (signal.aborted) {
            console.log(`[LLM:Turn #${turnId}] 🛑 Output aborted during token dispatch.`);
            return;
          }
          tokenCount++;
          const tok = tokens[i] + (i === tokens.length - 1 ? '' : ' ');
          onToken(tok, tokenCount);
          await new Promise(r => setTimeout(r, 35));
        }

        if (!signal.aborted) {
          const committedSlots = bookingSession.commitStaged();
          onComplete(fullReply, committedSlots, tokenCount);
        }
        return;
      }

    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        bookingSession.discardStaged();
        console.log(`[LLM:Turn #${turnId}] 🛑 Groq stream aborted cleanly via AbortController.`);
        return;
      }
      console.warn(`[LLM:Turn #${turnId}] ⚠️ Groq call failed, falling back to local dialog engine: ${err.message}`);
    }
  }

  // --- Offline High-Performance Fallback Dialog Engine ---
  await runOfflineFallback({
    userTranscript,
    bookingSession,
    turnId,
    signal,
    onToken,
    onComplete
  });
}

/**
 * Stream SSE tokens with AbortController handling
 */
async function streamSSE(response, signal, turnId, bookingSession, onToken, onComplete) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let tokenCount = 0;
  let fullReply = '';
  let buffer = '';

  while (true) {
    if (signal.aborted) {
      reader.cancel().catch(() => {});
      bookingSession.discardStaged();
      console.log(`[LLM:Turn #${turnId}] 🛑 Stream aborted mid-generation. Tokens sent: ${tokenCount}`);
      return;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            tokenCount++;
            fullReply += delta;
            onToken(delta, tokenCount);
          }
        } catch {
          // ignore partial JSON
        }
      }
    }
  }

  if (!signal.aborted) {
    const cleaned = cleanSpokenText(fullReply);
    const committedSlots = bookingSession.commitStaged();
    console.log(`[LLM:Turn #${turnId}] ✅ Stream complete (${tokenCount} tokens).`);
    onComplete(cleaned, committedSlots, tokenCount);
  }
}

/**
 * Strips markdown and asterisks to ensure smooth spoken voice output
 */
function cleanSpokenText(text) {
  return text
    .replace(/[*_#`~]/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Intelligent Local Dialog Engine for Offline / Fallback Operations
 */
async function runOfflineFallback({
  userTranscript,
  bookingSession,
  turnId,
  signal,
  onToken,
  onComplete
}) {
  const lower = userTranscript.toLowerCase();
  let fullReply = '';

  // Check 1: Explicit reservation intent
  const isBookingIntent = /book|reserve|table|reservation|seat|party of/i.test(lower);
  if (isBookingIntent) {
    const extracted = bookingSession.extractSlotsFromText(userTranscript);
    const staged = bookingSession.stageUpdate(extracted);
    const missing = [];
    if (!staged.date) missing.push('date');
    if (!staged.time) missing.push('time');
    if (!staged.partySize) missing.push('party size');
    if (!staged.name) missing.push('your name');

    if (missing.length === 0) {
      fullReply = `Wonderful! I have confirmed your table for ${staged.partySize} guests at ${staged.time} on ${staged.date}, under ${staged.name}. We look forward to welcoming you!`;
    } else {
      fullReply = `I would be happy to reserve a table for you. Could you share your preferred ${missing.join(', ')}?`;
    }
  }
  // Check 2: Restaurant inquiries (Hours, Menu, Policies, Location)
  else if (/hour|open|close|time|menu|food|pasta|pizza|vegan|gluten|wine|dress|parking|valet|address|location/i.test(lower)) {
    const knowledgeSnippet = searchKnowledgeBase({ query: userTranscript });
    if (/hour|open|close/i.test(lower)) {
      fullReply = 'Bella Vista is open Monday through Thursday from 11:30 AM to 10 PM, Friday until 11 PM, and weekends from 11 AM with brunch.';
    } else if (/menu|dish|food|pasta|pizza/i.test(lower)) {
      fullReply = 'We offer handmade pastas like cacio e pepe and wild boar pappardelle, along with wood-fired Neapolitan pizzas and Mediterranean branzino.';
    } else if (/parking|valet/i.test(lower)) {
      fullReply = 'Complimentary valet parking is available Thursday through Sunday evenings, and 2-hour validated parking is across the street.';
    } else if (/dress|wear/i.test(lower)) {
      fullReply = 'Our dress code is smart casual. Collared shirts or smart casual attire are recommended for dinner.';
    } else {
      fullReply = 'We are located at 742 Evergreen Promenade in San Francisco. Please let me know how else I can help!';
    }
  }
  // Check 3: General conversational & knowledge inquiries
  else if (/tide|ocean|moon/i.test(lower)) {
    fullReply = 'Tides are the rise and fall of sea levels caused primarily by the gravitational pull of the moon and sun on Earth oceans.';
  } else if (/how are you|hello|hi\b|good morning|good evening/i.test(lower)) {
    fullReply = 'Hello! I am doing great and ready to help. What would you like to explore today?';
  } else if (/weather/i.test(lower)) {
    fullReply = 'For live weather forecasts, please ensure our web search tool is connected. Right now it is pleasant and clear in the city.';
  } else {
    fullReply = 'I can help answer questions, explore ideas, or look up information for you. What would you like to know?';
  }

  const tokens = fullReply.split(' ');
  let tokenCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (signal.aborted) {
      bookingSession.discardStaged();
      console.log(`[LLM:Turn #${turnId}] 🛑 Offline fallback aborted.`);
      return;
    }
    tokenCount++;
    const tok = tokens[i] + (i === tokens.length - 1 ? '' : ' ');
    onToken(tok, tokenCount);
    await new Promise(r => setTimeout(r, 40));
  }

  if (!signal.aborted) {
    const committedSlots = bookingSession.commitStaged();
    onComplete(fullReply, committedSlots, tokenCount);
  }
}
