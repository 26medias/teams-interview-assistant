# Prototype Plan: Real-Time Meeting Transcription

## Objective

Capture audio from a Teams meeting and transcribe it in real-time with speaker labels in the terminal. This validates the core transcription pipeline before building the full product.

## Architecture

```
┌──────────────┐         ┌────────────┐
│ Teams meeting │ audio   │ System     │ raw PCM16
│ (user joins  │────────►│ audio      │──────────┐
│  normally)   │         │ capture    │          │
└──────────────┘         │ (SoX)     │          │
                         └────────────┘          │
                                                 ▼
                                          ┌────────────┐
                                          │ Deepgram   │ streaming STT
                                          │ Nova-2     │ via WebSocket
                                          └──────┬─────┘
                                                 │ transcript
                                                 ▼
                                             Terminal:
                                             [Speaker 0] Tell me about...
                                             [Speaker 1] Sure, I spent...
```

The user joins the Teams meeting normally (browser or desktop app). The prototype captures system audio and streams it to Deepgram for real-time transcription with speaker diarization.

### Why not ACS bot joining?

The Azure Communication Services Call Automation JS SDK does not support joining a Teams meeting by link (the `teamsMeetingLink` field is not exposed in the SDK). Implementing it via raw REST API + HMAC auth is significant overhead for a prototype. Local audio capture validates the same core capability (real-time STT) with zero Azure setup.

Bot-based meeting joining will be implemented in the full product backend.

## Model: Deepgram Nova-2

Deepgram Nova-2 handles all speech-to-text via its native WebSocket streaming API. ~300ms latency, built-in speaker diarization, simple SDK (`@deepgram/sdk`). Cost: ~$0.0043/min.

## How It Works

1. User joins the Teams meeting normally on their computer
2. User runs: `npm run prototype`
3. Prototype captures system audio via SoX (what the user hears through their speakers/headphones)
4. Audio is streamed in real-time to Deepgram Nova-2 via WebSocket
5. Deepgram returns transcription with speaker diarization (Speaker 0, Speaker 1, ...)
6. Transcript is printed to the terminal in real-time
7. Ctrl+C stops capture and exits

## Speaker Identification

Deepgram's built-in diarization labels speakers as "Speaker 0", "Speaker 1", etc. For the prototype, this is sufficient. The full product will resolve actual names via the Teams participant roster.

## Requirements

### System

- Node.js >= 20
- npm
- SoX (`sox`) installed on the system for audio capture
    - Linux: `sudo apt install sox libsox-fmt-pulseaudio`
    - macOS: `brew install sox`

### npm Dependencies

**Runtime:**
- `@deepgram/sdk` — streaming STT WebSocket client
- `dotenv` — load environment variables from `.env`

**Dev:**
- `typescript`
- `tsx` — run TypeScript directly without build step
- `@types/node`

### Environment Variables (`.env`)

```
DEEPGRAM_API_KEY=<key>
```

### Prototype File Structure

```
prototype/
    src/
        index.ts            — CLI entry point, starts audio capture + transcription
        audio-capture.ts    — spawns SoX, returns readable PCM16 audio stream
        transcription.ts    — Deepgram streaming client, handles diarization + display
    package.json
    tsconfig.json
    .env
```

## Out of Scope (prototype)

- Bot joining Teams meetings (full product feature, requires ACS REST API or Bot Framework)
- Actual speaker names (prototype uses Speaker 0/1/2 labels)
- Question generation / follow-up suggestions
- Persistent storage of transcripts
- Any UI — terminal output only
- Authentication / multi-user
