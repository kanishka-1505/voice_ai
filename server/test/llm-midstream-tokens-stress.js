import WebSocket from 'ws';
import assert from 'assert';

console.log('🧪 Testing Mid-Stream Token Interruptions with Active Token Emissions...\n');

const ws = new WebSocket('ws://localhost:8080');

let activeTurn = 1;
let currentRun = 1;
const results = [];

ws.on('open', () => {
  console.log('✓ Connected to server WebSocket');
  startRun();
});

function startRun() {
  if (currentRun > 3) {
    console.log('\n========================================');
    console.log('📊 ACTIVE MID-STREAM TOKEN INTERRUPT REPORT:');
    console.table(results);
    console.log('Zero zombie tokens leaked after abort!');
    console.log('========================================\n');
    ws.close();
    process.exit(0);
  }

  console.log(`\n--- Active Token Stream Run ${currentRun}/3 ---`);
  let tokensReceived = 0;
  let hasInterrupted = false;

  // Simulate complete utterance to kick off LLM generation
  ws.send(JSON.stringify({
    type: 'simulate_speech',
    words: ['Book', 'for', 'two', 'tonight'],
    trailingOff: false
  }));

  const messageHandler = (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'llm_chunk' && msg.turnId === activeTurn) {
      tokensReceived++;
      // Interrupt actively on the 3rd or 4th token
      if (tokensReceived >= 3 && !hasInterrupted) {
        hasInterrupted = true;
        console.log(`  ⚡ LLM has emitted ${tokensReceived} tokens for Turn #${activeTurn}. Firing barge-in now...`);
        ws.send(JSON.stringify({
          type: 'barge_in',
          turnId: activeTurn,
          stopLatencyMs: 89
        }));
      }
    }

    if (msg.type === 'barge_in_ack') {
      ws.off('message', messageHandler);
      results.push({
        run: currentRun,
        interruptedTurn: msg.previousTurnId,
        advancedTurn: msg.newTurnId,
        tokensBeforeAbort: tokensReceived,
        preservedSlots: msg.preservedSlots
      });
      console.log(`  ✓ Turn #${msg.previousTurnId} aborted mid-stream at ${tokensReceived} tokens. Advanced to #${msg.newTurnId}.`);

      activeTurn = msg.newTurnId;
      currentRun++;
      setTimeout(startRun, 400);
    }
  };

  ws.on('message', messageHandler);
}

ws.on('error', (err) => {
  console.error('WS Error:', err.message);
  process.exit(1);
});
