# Browser-Based Voice Assistant with Real Barge-in

A browser-based voice assistant demonstrating real barge-in interruption. When the user speaks, playback stops immediately, and every upstream request tagged with the interrupted `turnId` is cancelled.

## Architecture

```
Mic (getUserMedia, echoCancellation: true)
  → VAD (Silero, client-side, onnxruntime-web / @ricky0123/vad-web)
    → ASR (streaming, partial + final) [Phase 1]
      → LLM (streaming tokens, slot-filling) [Phase 2]
        → TTS (streaming audio chunks) [Phase 3]
          → Playback Queue (Web Audio API, AudioBufferSourceNode)
```

## Barge-in & Cancellation Table

| Turn ID | State | Trigger | Playback Stopped (ms) | Server Notified | Upstream Cancelled | Stale Audio Dropped |
|---------|-------|---------|-----------------------|-----------------|--------------------|---------------------|
| 1       | IDLE  | Init    | -                     | Yes             | N/A                | N/A                 |

## Phase 0: Infrastructure & Plumbing

- **Hard-stop playback primitive**: Instantly calls `.stop(0)` on playing `AudioBufferSourceNode`s and disconnects them with 0ms delay.
- **Client-side Silero VAD**: Runs ONNX model in WebAssembly to detect speech onset locally.
- **Turn tracking**: Monotonically increasing `turnId` invalidates stale responses.
- **Real-time Debug Overlay**: Live display of state machine status, current `turnId`, VAD-to-stop latency (ms), frame counters, and event log.

## Quickstart

### Prerequisites
- Node.js LTS (v20+) & npm

### Server Setup
```bash
cd server
npm install
npm run dev
```

### Client Setup
```bash
cd client
npm install
npm run dev
```
Open `http://localhost:5173` in Google Chrome (Desktop).
