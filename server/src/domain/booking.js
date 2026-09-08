/**
 * Booking Domain State & Slot-Filling Engine
 *
 * Manages session-scoped reservation slots:
 * - date (e.g. "Tonight", "Tomorrow", "Friday")
 * - time (e.g. "7:00 PM", "8:30 PM")
 * - partySize (e.g. 2, 4, 7)
 * - name (e.g. "Alex", "Sarah")
 *
 * Implements a transactional staging pattern:
 * When an LLM turn begins, slot candidates are staged.
 * If barge-in occurs mid-generation, staged slots are discarded,
 * ensuring already confirmed slots remain completely uncorrupted.
 */

const WORD_TO_NUMBER = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12
};

export class BookingSession {
  /**
   * @param {number|string} sessionId
   */
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.confirmedSlots = {
      date: null,
      time: null,
      partySize: null,
      name: null
    };
    this.stagedSlots = null;
  }

  getSlots() {
    return { ...this.confirmedSlots };
  }

  getStagedSlots() {
    return this.stagedSlots ? { ...this.stagedSlots } : null;
  }

  /**
   * Stage a slot update while generation is active.
   * @param {object} partial
   */
  stageUpdate(partial) {
    this.stagedSlots = {
      ...this.confirmedSlots,
      ...partial
    };
    return { ...this.stagedSlots };
  }

  /**
   * Commit staged slots once generation completes without interruption.
   */
  commitStaged() {
    if (this.stagedSlots) {
      this.confirmedSlots = { ...this.stagedSlots };
      this.stagedSlots = null;
    }
    return { ...this.confirmedSlots };
  }

  /**
   * Discard staged slots upon barge-in interruption.
   */
  discardStaged() {
    this.stagedSlots = null;
    return { ...this.confirmedSlots };
  }

  isComplete() {
    const s = this.confirmedSlots;
    return Boolean(s.date && s.time && s.partySize && s.name);
  }

  getMissingSlots() {
    const s = this.confirmedSlots;
    const missing = [];
    if (!s.date) missing.push('date');
    if (!s.time) missing.push('time');
    if (!s.partySize) missing.push('partySize');
    if (!s.name) missing.push('name');
    return missing;
  }

  reset() {
    this.confirmedSlots = {
      date: null,
      time: null,
      partySize: null,
      name: null
    };
    this.stagedSlots = null;
  }

  /**
   * Extract slots from user text, respecting existing slots and corrections.
   * @param {string} text
   * @returns {object} extracted partial slots
   */
  extractSlotsFromText(text) {
    const t = (text || '').toLowerCase();
    const extracted = {};

    // 1. Party Size (including corrections like "actually make that 7 people", "change to 4")
    const partyMatch = t.match(/(?:table\s+(?:for|of)|party\s+(?:for|of)|make\s+that|change\s+to|for)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+people|\s+guests)?/i)
      || t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:people|guests)/i);

    if (partyMatch) {
      const val = partyMatch[1].toLowerCase();
      const num = WORD_TO_NUMBER[val] || parseInt(val, 10);
      if (!isNaN(num) && num > 0 && num <= 12) {
        extracted.partySize = num;
      }
    } else {
      // Direct single number fallback if specifically correcting
      const directNum = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
      if (directNum && (t.includes('people') || t.includes('guests') || t.includes('party') || t.includes('make that'))) {
        extracted.partySize = WORD_TO_NUMBER[directNum[1]];
      }
    }

    // 2. Date
    if (t.includes('tonight') || t.includes('this evening') || t.includes('today')) {
      extracted.date = 'Tonight';
    } else if (t.includes('tomorrow')) {
      extracted.date = 'Tomorrow';
    } else {
      const dayMatch = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      if (dayMatch) {
        extracted.date = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase();
      }
    }

    // 3. Time
    const timeMatch = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pm|am)?\b/i);
    if (timeMatch) {
      const rawHour = parseInt(timeMatch[1], 10);
      const mins = timeMatch[2] || '00';
      const meridiem = (timeMatch[3] || '').toUpperCase();

      // Check if this number is likely a time (between 5 and 10 or with pm/am)
      const isTimeContext = t.includes('at') || t.includes('pm') || t.includes('am') || t.includes("o'clock") || (rawHour >= 5 && rawHour <= 10);
      if (isTimeContext && !partyMatch?.includes(timeMatch[0])) {
        let hour = rawHour;
        const tag = meridiem || (hour < 12 ? 'PM' : 'AM');
        extracted.time = `${hour}:${mins} ${tag}`;
      }
    }

    // 4. Name
    const nameMatch = t.match(/(?:my\s+name\s+is|name['’]?s|under|it['’]?s|call\s+me|i['’]?m)\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (nameMatch) {
      const candidate = nameMatch[1].trim();
      // Exclude common non-name filler words
      const excluded = ['a', 'the', 'booking', 'table', 'two', 'three', 'four', 'five', 'six', 'seven', 'tonight', 'tomorrow'];
      if (!excluded.includes(candidate.toLowerCase())) {
        extracted.name = candidate.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
    }

    return extracted;
  }
}
