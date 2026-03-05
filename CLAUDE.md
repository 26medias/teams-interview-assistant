# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered interview assistant for Microsoft Teams. Upload a candidate's resume, hiring criteria, and job description, then the assistant joins a Teams call to provide real-time question suggestions and follow-ups. After the call, it generates a full evaluation report.

## Project Structure

```
docs/specs/        - Product specifications and implementation plans
prototype/         - Local-only prototype (TypeScript) — real-time transcription via SoX + Deepgram
candidate-agent/   - AI agent that joins Teams meetings and emulates a candidate
backend/           - API server (TypeScript, Postgres, Milvus, Google Cloud)
frontend/          - Web UI (React, Tailwind CSS, hash router)
```

## Candidate Agent

### Architecture

The candidate agent joins a Teams meeting via Playwright (Chromium), listens to the interviewer, generates responses with an LLM, and speaks them back via TTS — all automatically.

```
Playwright joins Teams meeting via browser (--use-fake-device-for-media-stream)
    |
    +---> SoX captures system audio → Deepgram transcribes in real-time
    |                                       |
    |                                       v (on utterance end)
    |                                  Mute Deepgram + play filler phrase
    |                                       |
    |                                       v
    |                                  Gemini 2.5 Flash generates response
    |                                       |
    |                                       v
    |                                  ElevenLabs TTS → PCM audio
    |                                       |
    +<--- page.evaluate() injects audio into WebRTC via Web Audio API
    |
    v
Teams meeting hears the candidate
```

### Key Technical Decisions

- **No ACS / no Azure phone numbers**: We tried Azure Communication Services (answerCall + Event Grid) but it required a phone number and Event Grid subscription setup. Dropped in favor of Playwright for simplicity.
- **No PulseAudio virtual sink for mic**: Playwright's bundled Chromium can't access PulseAudio devices. Instead, we use `--use-fake-device-for-media-stream` and inject audio via Web Audio API.
- **Audio injection via addInitScript**: Before Teams loads, we override `getUserMedia`, `RTCPeerConnection.addTrack`, and `RTCRtpSender.replaceTrack` to swap in a custom `MediaStreamDestination` audio track. TTS audio is played into this track via `page.evaluate()` with base64 PCM data.
- **SoX for audio capture**: SoX with PulseAudio captures system audio (the meeting output) and pipes it as a PCM stream to Deepgram. This works because PipeWire provides PulseAudio compatibility.
- **Muting during speech**: Deepgram audio feed is muted while the agent speaks (THINKING + SPEAKING states) to prevent self-listening loops. Pending utterances are cleared on resume.
- **Filler phrases**: Pre-generated at startup via TTS. A random filler plays immediately when the interviewer stops speaking, while the LLM generates the real response in parallel.
- **ElevenLabs PCM format**: `output_format=pcm_16000` must be a URL query parameter, not in the JSON body. The body parameter is silently ignored and returns MP3.
- **AudioContext at 48kHz**: The injected AudioContext runs at 48kHz (WebRTC native rate). 16kHz PCM from TTS is resampled automatically by the browser when creating the AudioBuffer.

### File Structure

```
candidate-agent/
├── package.json
├── tsconfig.json          # ES2022, Node16 modules, ESM
├── .env                   # API keys (DEEPGRAM, GEMINI, ELEVENLABS)
└── src/
    ├── index.ts           # CLI parsing (--meeting, --resume, --name, --behavior, --tts, --verbose)
    ├── orchestrator.ts    # State machine: LISTENING → THINKING → SPEAKING → LISTENING
    ├── meeting/
    │   └── join.ts        # Playwright join + Web Audio API injection + playAudioInMeeting()
    ├── audio/
    │   ├── capture.ts     # SoX → Readable PCM stream (16kHz mono 16-bit)
    │   └── tts.ts         # ElevenLabs API or local piper → PCM buffer
    ├── transcription/
    │   └── deepgram.ts    # Deepgram nova-2, stream-based, mutable, emits transcript/utterance-end
    └── ai/
        ├── resume-parser.ts   # pdf-parse → text
        └── candidate-llm.ts   # Gemini 2.5 Flash with behavior directive system prompt
```

### Dependencies

- `playwright` — Chromium browser automation (joins Teams web UI)
- `@deepgram/sdk` — Real-time speech-to-text (nova-2 model with diarization)
- `@google/genai` — Gemini 2.5 Flash for generating candidate responses
- `pdf-parse` — PDF resume text extraction
- `dotenv` — Environment variable loading
- System: `sox`, `libsox-fmt-pulse`, `pulseaudio-utils` (for SoX audio capture and pactl)

### State Machine

```
IDLE → LISTENING → THINKING → SPEAKING → LISTENING → ...
         │              │           │
         │ (mute off)   │ (mute on, │ (mute on,
         │              │  filler)   │  TTS audio)
         │              │           │
         └──────────────┴───────────┘
              pendingUtterance cleared on resume
```

### CLI

```bash
npm run candidate -- --meeting <url> --resume <path.pdf> --name "Name" --behavior "description"
```

Flags: `--meeting` (required), `--resume` (required), `--name` (required), `--behavior` (required), `--tts elevenlabs|local`, `--verbose`

## Tech Stack

- **Prototype**: TypeScript, SoX audio capture, Deepgram transcription, fully local
- **Candidate Agent**: TypeScript, Playwright (Chromium), Web Audio API injection, SoX, Deepgram, Gemini 2.5 Flash, ElevenLabs/piper TTS
- **Backend**: TypeScript, Postgres, Milvus (RAG for question ranking), Google Cloud Bucket (document storage), deployed to Google Cloud Functions
- **Frontend**: React JS, Tailwind CSS, hash router

## Commands

- **Prototype**: `npm run prototype` — captures system audio and transcribes in real time with speaker diarization
- **Candidate Agent**: `npm run candidate -- --meeting <url> --resume <path.pdf> --name "Name" --behavior "description"` — joins a Teams meeting via Playwright and emulates a candidate
- **Backend local dev**: uses local Postgres and local Milvus server

## Code Conventions

- 1 tab = 4 spaces
- Comment non-obvious code blocks
