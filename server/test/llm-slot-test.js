import assert from 'assert';
import { BookingSession } from '../src/domain/booking.js';
import { streamLLMResponse } from '../src/llm.js';
import WebSocket from 'ws';

console.log('🧪 Running Phase 2 Streaming LLM & Slot-Filling Tests...\n');

// --- 1. Domain Unit Tests ---
console.log('Test 1: BookingSession Slot Extraction & Correction Unit Tests');
const session = new BookingSession('test-client');

// Extract initial slots
const initial = session.extractSlotsFromText('Book a table for two tonight at 7 PM');
assert.strictEqual(initial.date, 'Tonight', 'Date should be Tonight');
assert.strictEqual(initial.time, '7:00 PM', 'Time should be 7:00 PM');
assert.strictEqual(initial.partySize, 2, 'Party size should be 2');
console.log('  ✓ Initial slot extraction passed:', initial);

// Stage and commit
session.stageUpdate(initial);
session.commitStaged();
assert.deepStrictEqual(session.getSlots(), { date: 'Tonight', time: '7:00 PM', partySize: 2, name: null });
console.log('  ✓ Confirmed slots committed:', session.getSlots());

// Slot correction mid-confirmation
const correction = session.extractSlotsFromText('Actually make that seven people');
assert.strictEqual(correction.partySize, 7, 'Party size should be updated to 7');
session.stageUpdate(correction);
session.commitStaged();
assert.strictEqual(session.getSlots().partySize, 7, 'Confirmed partySize must be 7');
assert.strictEqual(session.getSlots().date, 'Tonight', 'Date must remain preserved');
assert.strictEqual(session.getSlots().time, '7:00 PM', 'Time must remain preserved');
console.log('  ✓ Slot correction passed without corrupting existing slots:', session.getSlots());

// Complete booking
const nameSlot = session.extractSlotsFromText('My name is Alex Smith');
assert.strictEqual(nameSlot.name, 'Alex Smith', 'Name should be Alex Smith');
session.stageUpdate(nameSlot);
session.commitStaged();
assert.strictEqual(session.isComplete(), true, 'Session should be complete');
console.log('  ✓ Full 4/4 slots confirmed:', session.getSlots());

// Staging discard test (simulation of mid-generation interrupt)
session.stageUpdate({ partySize: 12 });
assert.strictEqual(session.getStagedSlots().partySize, 12);
session.discardStaged();
assert.strictEqual(session.getSlots().partySize, 7, 'Party size must revert to 7 after abort');
console.log('  ✓ Staging discard on abort verified (slots preserved)');

// --- 2. LLM Mid-Generation Abort Test ---
console.log('\nTest 2: LLM Mid-Stream AbortController Test');
const testSession = new BookingSession('abort-test');
const controller = new AbortController();

let receivedTokens = [];
let completeCalled = false;

streamLLMResponse({
  userTranscript: 'Book a table for 4 tomorrow at 6 PM',
  bookingSession: testSession,
  turnId: 1,
  signal: controller.signal,
  onToken: (token, count) => {
    receivedTokens.push(token);
    if (count === 3) {
      // Abort mid-generation on 3rd token!
      controller.abort();
    }
  },
  onComplete: () => {
    completeCalled = true;
  },
  onError: (err) => {
    console.error('LLM error:', err);
  }
});

// Verify after 350ms that token generation stopped and onComplete was NOT called
await new Promise(r => setTimeout(r, 350));
assert.strictEqual(completeCalled, false, 'onComplete must NOT be called when aborted');
assert.ok(receivedTokens.length >= 3 && receivedTokens.length <= 4, `Token generation must stop immediately. Tokens: ${receivedTokens.length}`);
assert.strictEqual(testSession.getStagedSlots(), null, 'Staged slots must be discarded on abort');
console.log(`  ✓ Mid-stream abort verified: Stopped at ${receivedTokens.length} tokens, staged slots purged cleanly.`);

// --- 3. WebSocket Integration Test ---
console.log('\n--- 3. Integration Tests via WebSocket ---');
const ws = new WebSocket('ws://localhost:8080');

let slotsReceived = false;
let correctionReceived = false;
let abortHandled = false;

ws.on('open', () => {
  console.log('✓ Connected to server WebSocket');

  // Step A: Send initial reservation
  console.log('Testing initial booking via WS: "Book a table for two tonight at 7 PM"');
  ws.send(JSON.stringify({
    type: 'simulate_speech',
    words: ['Book', 'a', 'table', 'for', 'two', 'tonight', 'at', '7', 'PM'],
    trailingOff: false
  }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === 'slots_updated' && !slotsReceived) {
    slotsReceived = true;
    console.log(`← Slots updated for Turn #${msg.turnId}:`, msg.slots);
    assert.strictEqual(msg.slots.partySize, 2);

    // Step B: Test slot correction
    setTimeout(() => {
      console.log('\nTesting slot correction via WS: "Actually make that seven people"');
      ws.send(JSON.stringify({
        type: 'simulate_speech',
        words: ['Actually', 'make', 'that', 'seven', 'people'],
        trailingOff: false
      }));
    }, 400);
  } else if (msg.type === 'slots_updated' && slotsReceived && !correctionReceived) {
    correctionReceived = true;
    console.log(`← Slots corrected for Turn #${msg.turnId}:`, msg.slots);
    assert.strictEqual(msg.slots.partySize, 7, 'Party size must update to 7');

    // Step C: Test mid-stream barge-in
    setTimeout(() => {
      console.log('\nTesting mid-generation barge-in via WS...');
      ws.send(JSON.stringify({
        type: 'barge_in',
        turnId: msg.turnId,
        stopLatencyMs: 95
      }));
    }, 150);
  }

  if (msg.type === 'barge_in_ack') {
    abortHandled = true;
    console.log(`← Barge-in ack received. Preserved slots:`, msg.preservedSlots);
    assert.strictEqual(msg.preservedSlots.partySize, 7, 'Preserved slots must keep corrected value');
    ws.close();
  }
});

ws.on('close', () => {
  if (slotsReceived && correctionReceived && abortHandled) {
    console.log('\n🎉 ALL PHASE 2 STREAMING LLM & SLOT-FILLING TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('✗ Some integration tests failed!', { slotsReceived, correctionReceived, abortHandled });
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('✗ WS error:', err.message);
  process.exit(1);
});
