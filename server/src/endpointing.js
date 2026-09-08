/**
 * Adaptive Endpointing Heuristic Engine
 *
 * Evaluates in-flight transcription text to determine how long to wait after
 * speech stops before committing the utterance.
 *
 * - Clean, syntactically complete sentence -> Short Window (500ms)
 * - Trailing-off phrase / filler word / dangling conjunction -> Long Window (1800ms)
 */

export const SHORT_WINDOW_MS = 500;
export const LONG_WINDOW_MS = 1800;

// Trailing fillers that indicate hesitation (with optional trailing dots or punctuation)
const FILLER_TRAILING_REGEX = /\b(um|uh|er|ah|erm|hmm)[\s.?!]*$/i;

// Dangling conjunctions at the end with no clause following
const DANGLING_CONJUNCTION_REGEX = /\b(and|or|but|because|if|then)[\s.?!]*$/i;

// Dangling prepositions with no noun following
const DANGLING_PREPOSITION_REGEX = /\b(at|with|to|in|by|around|about|from)[\s.?!]*$/i;

// Incomplete slot starters
const INCOMPLETE_SLOT_REGEX = /\b(table for|party of|seats for|reservation for|booked for)[\s.?!]*$/i;

// Idiomatic complete phrases ending in "so" or "for" that are NOT trailing off
const COMPLETE_SO_IDIOMS = /\b(think so|hope so|guess so|assume so|say so|suppose so|believe so|told you so|right so)\W*$/i;
const COMPLETE_FOR_IDIOMS = /\b(looking for|waiting for|all for now|ready for|good for|asking for|called for|care for)\W*$/i;

/**
 * @param {string} text
 * @returns {{ windowType: 'short'|'long', windowMs: number, reason: string }}
 */
export function evaluateEndpointing(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return {
      windowType: 'short',
      windowMs: SHORT_WINDOW_MS,
      reason: 'Empty utterance'
    };
  }

  // 1. If ends in terminal punctuation (., ?, !), the sentence is syntactically closed
  if (/[.?!]$/.test(trimmed)) {
    // Check if it's not a dangling filler with punctuation like "uh..."
    if (!FILLER_TRAILING_REGEX.test(trimmed.replace(/[.?!]+$/, ''))) {
      return {
        windowType: 'short',
        windowMs: SHORT_WINDOW_MS,
        reason: 'Terminal punctuation detected ➔ sentence complete'
      };
    }
  }

  // 2. Sentences containing "so", "and", "for" with complete clauses following
  // e.g. "I'll take the seven PM slot, so that works"
  // If the last word is not "so", "and", "for", it is NOT dangling on that conjunction!
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1].replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();

  // 3. Genuine trailing fillers ("book a table for, uh...")
  if (FILLER_TRAILING_REGEX.test(trimmed)) {
    const match = trimmed.match(FILLER_TRAILING_REGEX);
    return {
      windowType: 'long',
      windowMs: LONG_WINDOW_MS,
      reason: `Trailing filler detected: "${match[1]}" ➔ extending wait window`
    };
  }

  // 4. Incomplete slot phrase ("Table for...")
  if (INCOMPLETE_SLOT_REGEX.test(trimmed)) {
    const match = trimmed.match(INCOMPLETE_SLOT_REGEX);
    return {
      windowType: 'long',
      windowMs: LONG_WINDOW_MS,
      reason: `Incomplete slot phrase: "${match[1]}" ➔ holding turn`
    };
  }

  // 5. Check if ends on "so"
  if (lastWord === 'so') {
    if (COMPLETE_SO_IDIOMS.test(trimmed)) {
      return {
        windowType: 'short',
        windowMs: SHORT_WINDOW_MS,
        reason: `Complete idiom ("${trimmed.slice(-15)}") ➔ fast commit`
      };
    }
    return {
      windowType: 'long',
      windowMs: LONG_WINDOW_MS,
      reason: 'Dangling conjunction "so" at end ➔ expecting continuation'
    };
  }

  // 6. Check if ends on "for"
  if (lastWord === 'for') {
    if (COMPLETE_FOR_IDIOMS.test(trimmed)) {
      return {
        windowType: 'short',
        windowMs: SHORT_WINDOW_MS,
        reason: `Complete phrase ("${trimmed.slice(-15)}") ➔ fast commit`
      };
    }
    return {
      windowType: 'long',
      windowMs: LONG_WINDOW_MS,
      reason: 'Dangling preposition "for" at end ➔ waiting for slot value'
    };
  }

  // 7. Check if ends on dangling conjunctions ("and", "or", "but")
  if (DANGLING_CONJUNCTION_REGEX.test(trimmed)) {
    return {
      windowType: 'long',
      windowMs: LONG_WINDOW_MS,
      reason: `Dangling conjunction "${lastWord}" at end ➔ expecting continuation`
    };
  }

  // 8. Check if ends on dangling prepositions ("at", "with", "to")
  if (DANGLING_PREPOSITION_REGEX.test(trimmed)) {
    return {
      windowType: 'long',
      windowMs: LONG_WINDOW_MS,
      reason: `Dangling preposition "${lastWord}" at end ➔ waiting for slot value`
    };
  }

  // 9. Default: Syntactically complete utterance
  return {
    windowType: 'short',
    windowMs: SHORT_WINDOW_MS,
    reason: 'Clean complete utterance ➔ fast commit'
  };
}
