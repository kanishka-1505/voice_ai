/**
 * Streaming LLM Orchestrator with AbortController Mid-Generation Cancellation
 *
 * Requirements:
 * 1. Streams tokens turnId-tagged back to the client.
 * 2. Real-time AbortController cancellation: aborts in-flight generation mid-stream.
 * 3. Staged slot updates: uncommitted slot updates are discarded if interrupted.
 * 4. Supports OpenAI API if OPENAI_API_KEY is configured, with intelligent local streaming fallback.
 */

export async function streamLLMResponse({
  userTranscript,
  bookingSession,
  turnId,
  signal,
  onToken,
  onComplete,
  onError
}) {
  const previousSlots = bookingSession.getSlots();

  // 1. Extract candidate slots from utterance
  const extracted = bookingSession.extractSlotsFromText(userTranscript);
  const stagedSlots = bookingSession.stageUpdate(extracted);

  // Check if a slot was corrected (e.g. partySize changed)
  const isPartyCorrected = extracted.partySize && previousSlots.partySize && extracted.partySize !== previousSlots.partySize;

  const groqKey = process.env.GROQ_API_KEY;

  // --- Real Groq Streaming LLM API (Primary Provider) ---
  if (groqKey) {
    try {
      const baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const requestedModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

      console.log(`[LLM:Turn #${turnId}] 🌐 LIVE OUTBOUND REQUEST: POST https://api.groq.com/openai/v1/chat/completions (Groq ${requestedModel})`);

      const systemPrompt = `You are a polite, concise restaurant booking assistant for Bella Vista Italian Kitchen.
Current confirmed reservation slots: ${JSON.stringify(previousSlots)}.
New candidate slots extracted: ${JSON.stringify(stagedSlots)}.
Provide a concise (1-2 sentences) natural conversational response confirming any new details and asking for any remaining missing slots (date, time, party size, name).
Do not use markdown formatting.`;

      let response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        signal, // AbortController signal cancels the live network request!
        body: JSON.stringify({
          model: requestedModel,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTranscript }
          ]
        })
      });

      // Gracefully handle tier model availability (e.g. if 70b is restricted on free tier)
      if (response.status === 404 && requestedModel === 'llama-3.3-70b-versatile') {
        const altModel = 'openai/gpt-oss-20b';
        console.warn(`[LLM:Turn #${turnId}] ⚠️ Model llama-3.3-70b-versatile not found, retrying with ${altModel}...`);
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          signal,
          body: JSON.stringify({
            model: altModel,
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userTranscript }
            ]
          })
        });
      }

      if (!response.ok) {
        let errDetails = '';
        try {
          const errBody = await response.json();
          errDetails = errBody.error?.message || errBody.error?.code || response.statusText;
        } catch {
          errDetails = response.statusText;
        }
        throw new Error(`Groq HTTP ${response.status}: ${errDetails}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let tokenCount = 0;
      let fullReply = '';
      let buffer = '';

      while (true) {
        if (signal.aborted) {
          reader.cancel().catch(() => {});
          bookingSession.discardStaged();
          console.log(`[LLM:Turn #${turnId}] 🛑 Groq HTTP stream aborted mid-stream. Live connection closed. Tokens received: ${tokenCount}`);
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
            } catch (err) {
              // ignore partial json
            }
          }
        }
      }

      if (!signal.aborted) {
        const committed = bookingSession.commitStaged();
        console.log(`[LLM:Turn #${turnId}] ✅ Groq stream complete (${tokenCount} tokens). Reply: "${fullReply}". Committed slots:`, committed);
        onComplete(fullReply, committed, tokenCount);
      }
      return;

    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        bookingSession.discardStaged();
        console.log(`[LLM:Turn #${turnId}] 🛑 Groq HTTP request cancelled cleanly via AbortController. Signal abort caught.`);
        return;
      }
      console.warn(`[LLM:Turn #${turnId}] ⚠️ Groq call failed, falling back to local dialog engine: ${err.message}`);
    }
  }

  // --- Embedded High-Performance Dialog Engine (Offline / Local Mode) ---
  let fullReply = '';
  const missing = [];
  if (!stagedSlots.date) missing.push('date');
  if (!stagedSlots.time) missing.push('time');
  if (!stagedSlots.partySize) missing.push('party size');
  if (!stagedSlots.name) missing.push('your name');

  if (missing.length === 0) {
    fullReply = `Wonderful! I have confirmed your table for ${stagedSlots.partySize} guests at ${stagedSlots.time} on ${stagedSlots.date}, reserved under ${stagedSlots.name}. We look forward to welcoming you to Bella Vista!`;
  } else if (isPartyCorrected) {
    fullReply = `Understood! I've updated your party size to ${stagedSlots.partySize} people. ` + (
      missing.includes('time') ? `What time would you prefer for ${stagedSlots.date || 'your reservation'}?` :
      missing.includes('name') ? `May I have the name for the reservation?` :
      `Everything else is set!`
    );
  } else if (stagedSlots.partySize && stagedSlots.time && stagedSlots.date && !stagedSlots.name) {
    fullReply = `Great, table for ${stagedSlots.partySize} at ${stagedSlots.time} on ${stagedSlots.date}. May I have the name for the reservation?`;
  } else if (stagedSlots.partySize && stagedSlots.date && !stagedSlots.time) {
    fullReply = `Got it, a table for ${stagedSlots.partySize} for ${stagedSlots.date}. What time would you like to dine? We are open from 5 PM to 11 PM.`;
  } else if (stagedSlots.partySize && !stagedSlots.date) {
    fullReply = `Perfect, a table for ${stagedSlots.partySize}. What date and time would you like to book?`;
  } else if (stagedSlots.name && missing.length > 0) {
    fullReply = `Thank you, ${stagedSlots.name}. What date, time, and party size would you like to reserve?`;
  } else {
    fullReply = `I'd be glad to help you with a reservation at Bella Vista. Could you share your preferred date, time, and number of guests?`;
  }

  const tokens = fullReply.split(' ');
  let tokenCount = 0;
  let currentIndex = 0;
  let isCancelled = false;

  const onAbort = () => {
    isCancelled = true;
    bookingSession.discardStaged();
    console.log(`[LLM:Turn #${turnId}] 🛑 Request aborted mid-stream. Token count frozen at ${tokenCount}. Staged slots discarded.`);
  };

  signal.addEventListener('abort', onAbort, { once: true });

  function emitNextToken() {
    if (signal.aborted || isCancelled) {
      return;
    }

    if (currentIndex >= tokens.length) {
      signal.removeEventListener('abort', onAbort);
      const committedSlots = bookingSession.commitStaged();
      console.log(`[LLM:Turn #${turnId}] ✅ Generation complete (${tokenCount} tokens). Committed slots:`, committedSlots);
      onComplete(fullReply, committedSlots, tokenCount);
      return;
    }

    const token = tokens[currentIndex] + (currentIndex === tokens.length - 1 ? '' : ' ');
    tokenCount++;
    currentIndex++;

    onToken(token, tokenCount);
    setTimeout(emitNextToken, 45);
  }

  setTimeout(() => {
    if (!signal.aborted && !isCancelled) {
      emitNextToken();
    }
  }, 120);
}
