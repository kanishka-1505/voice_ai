import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080';

console.log('🧪 Starting WebSocket Protocol & Barge-in Test...');

const ws = new WebSocket(WS_URL);

let receivedSessionInit = false;
let receivedTelemetry = false;
let receivedBargeInAck = false;

ws.on('open', () => {
  console.log('✓ Connected to WebSocket server');

  // Send a batch of simulated raw PCM audio frames (each 1024 bytes = 512 16-bit samples)
  for (let i = 0; i < 5; i++) {
    const dummyPcm = Buffer.alloc(1024, (i % 128));
    ws.send(dummyPcm);
  }
  console.log('✓ Sent 5 binary PCM audio frames to server');

  // Trigger simulated barge-in event
  setTimeout(() => {
    console.log('⚡ Sending barge_in signal (Turn #1, stopLatency: 92ms)...');
    ws.send(JSON.stringify({
      type: 'barge_in',
      turnId: 1,
      stopLatencyMs: 92
    }));
  }, 300);
});

ws.on('message', (data, isBinary) => {
  if (isBinary) return;

  const msg = JSON.parse(data.toString());
  console.log('← Received from server:', msg.type, JSON.stringify(msg));

  if (msg.type === 'session_init') {
    receivedSessionInit = true;
  }

  if (msg.type === 'barge_in_ack') {
    receivedBargeInAck = true;
    if (msg.previousTurnId === 1 && msg.newTurnId === 2) {
      console.log('✓ Verified: Server invalidated Turn #1 and advanced to Turn #2');
    } else {
      console.error('✗ Turn invalidation mismatch:', msg);
      process.exit(1);
    }

    setTimeout(() => {
      ws.close();
    }, 200);
  }
});

ws.on('close', () => {
  console.log('✓ WebSocket closed cleanly');
  if (receivedSessionInit && receivedBargeInAck) {
    console.log('\n🎉 ALL WEBSOCKET & BARGE-IN ASSERTIONS PASSED!\n');
    process.exit(0);
  } else {
    console.error('✗ Some assertions failed!');
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('✗ WebSocket error:', err.message);
  process.exit(1);
});
