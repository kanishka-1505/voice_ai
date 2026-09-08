import assert from 'assert';
import { evaluateEndpointing, SHORT_WINDOW_MS, LONG_WINDOW_MS } from '../src/endpointing.js';
import WebSocket from 'ws';

console.log('🧪 Running Phase 1 Adaptive Endpointing Unit & Integration Tests...\n');

// --- 1. Unit Tests for Heuristic Rules ---
console.log('Test 1: Heuristic Unit Tests');

const cleanCase = evaluateEndpointing('Book a table for two tonight at seven PM');
assert.strictEqual(cleanCase.windowType, 'short', 'Clean sentence should use short window');
assert.strictEqual(cleanCase.windowMs, SHORT_WINDOW_MS);
console.log('  ✓ Clean sentence recognized -> SHORT (500ms)');

const trailingUh = evaluateEndpointing('Book a table for, uh...');
assert.strictEqual(trailingUh.windowType, 'long', 'Trailing filler should use long window');
assert.strictEqual(trailingUh.windowMs, LONG_WINDOW_MS);
console.log('  ✓ Trailing filler ("uh") recognized -> LONG (1800ms)');

const trailingUm = evaluateEndpointing('I would like to reserve a table, um');
assert.strictEqual(trailingUm.windowType, 'long', 'Trailing "um" should use long window');
console.log('  ✓ Trailing filler ("um") recognized -> LONG (1800ms)');

const trailingAnd = evaluateEndpointing('Can we have a booth and');
assert.strictEqual(trailingAnd.windowType, 'long', 'Trailing conjunction should use long window');
console.log('  ✓ Trailing conjunction ("and") recognized -> LONG (1800ms)');

const trailingFor = evaluateEndpointing('A reservation for');
assert.strictEqual(trailingFor.windowType, 'long', 'Trailing preposition should use long window');
console.log('  ✓ Trailing preposition ("for") recognized -> LONG (1800ms)');

const incompleteSlot = evaluateEndpointing('Party of');
assert.strictEqual(incompleteSlot.windowType, 'long', 'Incomplete slot should use long window');
console.log('  ✓ Incomplete slot ("party of") recognized -> LONG (1800ms)');

console.log('\n--- 2. Integration Tests via WebSocket ---');
const ws = new WebSocket('ws://localhost:8080');

let shortDecisionReceived = false;
let longDecisionReceived = false;
let bargeInHandled = false;

ws.on('open', () => {
  console.log('✓ Connected to server WebSocket');

  // Test Trailing-off Utterance
  console.log('Testing trailing-off utterance over WS: "Book a table for, uh..."');
  ws.send(JSON.stringify({
    type: 'simulate_speech',
    words: ['Book', 'a', 'table', 'for,', 'uh...'],
    trailingOff: true
  }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === 'endpointing_decision') {
    console.log(`← Decision received for Turn #${msg.turnId}: ${msg.windowType.toUpperCase()} (${msg.windowMs}ms) - "${msg.reason}"`);

    if (msg.windowType === 'long') {
      longDecisionReceived = true;
      assert.strictEqual(msg.windowMs, LONG_WINDOW_MS);

      // Now test Clean Utterance
      setTimeout(() => {
        console.log('\nTesting clean complete utterance over WS: "Table for two please"');
        ws.send(JSON.stringify({
          type: 'simulate_speech',
          words: ['Table', 'for', 'two', 'please'],
          trailingOff: false
        }));
      }, 500);
    } else if (msg.windowType === 'short') {
      shortDecisionReceived = true;
      assert.strictEqual(msg.windowMs, SHORT_WINDOW_MS);

      // Test Barge-in interruption
      setTimeout(() => {
        console.log('\nTesting barge-in interruption over WS...');
        ws.send(JSON.stringify({
          type: 'barge_in',
          turnId: msg.turnId,
          stopLatencyMs: 88
        }));
      }, 200);
    }
  }

  if (msg.type === 'barge_in_ack') {
    bargeInHandled = true;
    console.log(`← Barge-in acknowledged: Previous Turn #${msg.previousTurnId} ➔ New Turn #${msg.newTurnId}`);
    ws.close();
  }
});

ws.on('close', () => {
  if (shortDecisionReceived && longDecisionReceived && bargeInHandled) {
    console.log('\n🎉 ALL PHASE 1 ASR & ADAPTIVE ENDPOINTING TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('✗ Some integration tests failed!', { shortDecisionReceived, longDecisionReceived, bargeInHandled });
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('✗ WS error:', err.message);
  process.exit(1);
});
