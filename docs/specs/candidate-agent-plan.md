# Candidate Agent — Implementation Plan

A local agent that joins a Teams meeting via Playwright and emulates a candidate using TTS, driven by a resume, a behavior directive, and an LLM.

```
npm run candidate -- --meeting "https://teams.microsoft.com/meet/..." --resume path/to/resume.pdf --name "Lex Luthor" --behavior "The candidate aces the interview"
```

---

## Architecture Overview

Uses **Playwright** to join Teams meetings via the web UI as a guest. Audio routing is handled through a **PulseAudio virtual sink** — TTS output is played into the sink, and the browser uses the sink's monitor as its microphone input. Meeting audio is captured via **SoX** for real-time transcription.

```
┌────────────────────────────────────────────────────────────┐
│                       Orchestrator                          │
│  State machine: LISTENING → THINKING → SPEAKING → LISTENING │
└───┬──────────┬──────────────┬──────────────┬───────────────┘
    │          │              │              │
    ▼          ▼              ▼              ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Playwright│ │ Deepgram │ │ Gemini   │ │   TTS    │
│ Browser │ │  STT     │ │ 2.5 Flash│ │ElevenLabs│
│  Join   │ │          │ │          │ │ or Piper │
└────────┘ └──────────┘ └──────────┘ └──────────┘
     ▲           ▲              │           │
     │           │              │           │
     └───────────┴── PulseAudio + SoX ─────┘
                  (virtual audio routing)
```

### Audio Flow

```
Teams meeting audio
       │
       ▼  (SoX captures from PulseAudio default monitor)
  Raw PCM stream (16kHz, mono, 16-bit)
       │
       ▼
  Deepgram transcribes in real-time
       │
       ▼  (on utterance end)
  Gemini 2.5 Flash generates candidate response (resume + behavior + history)
       │
       ▼
  TTS converts text → PCM audio
       │
       ▼  (paplay → virtual sink → browser mic)
  Teams meeting hears the candidate
```

No Azure account needed. No phone numbers. No Event Grid. Just Playwright + PulseAudio.

---

## File Structure

```
candidate-agent/
├── package.json
├── tsconfig.json
├── .env
├── README.md
└── src/
    ├── index.ts                 # Entry point — CLI arg parsing, env validation
    ├── orchestrator.ts          # State machine, coordinates all components
    ├── meeting/
    │   ├── join.ts              # Playwright: join Teams meeting via browser
    │   └── virtual-audio.ts     # PulseAudio virtual sink + paplay playback
    ├── audio/
    │   ├── capture.ts           # SoX: capture system audio as PCM stream
    │   └── tts.ts               # TTS service: text → PCM buffer (ElevenLabs or piper)
    ├── transcription/
    │   └── deepgram.ts          # Deepgram live transcription from PCM audio stream
    └── ai/
        ├── resume-parser.ts     # Extract text from PDF resume
        └── candidate-llm.ts     # Gemini 2.5 Flash API: generate candidate responses
```

---

## Component Details

### 1. `index.ts` — Entry Point

- Parse CLI args: `--meeting`, `--resume`, `--name`, `--behavior`, `--tts`, `--verbose`
- Validate env vars (`DEEPGRAM_API_KEY`, `GEMINI_API_KEY`)
- Call `orchestrator.run(config)`
- Handle `SIGINT` for clean shutdown

### 2. `meeting/join.ts` — Playwright Meeting Join

Launches Chromium via Playwright and joins a Teams meeting as a guest:

- Navigates to the meeting URL
- Clicks "Continue on this browser"
- Fills in the candidate's display name
- Turns off camera
- Clicks "Join now"

The browser is launched with flags to use the PulseAudio virtual sink's monitor as the audio input device.

### 3. `meeting/virtual-audio.ts` — PulseAudio Virtual Audio

Creates a PulseAudio null sink that acts as a virtual microphone:

- `createVirtualSink()` — loads `module-null-sink` with a named sink
- `playAudio(pcmBuffer)` — plays raw PCM into the sink via `paplay`
- `destroyVirtualSink()` — unloads the module on cleanup

The browser picks up the sink's monitor as its microphone, so TTS audio is routed directly into the meeting.

### 4. `audio/capture.ts` — SoX Audio Capture

Captures system audio via SoX + PulseAudio:

- Outputs raw PCM16 at 16kHz mono (matches Deepgram input format)
- Returns a `Readable` stream for piping to Deepgram
- Based on the prototype's audio capture implementation

### 5. `audio/tts.ts` — Text-to-Speech

Two backends:

**ElevenLabs (default):** API-based, high quality. Requests `pcm_16000` output format.

**Piper (local fallback):** Runs locally, no API key. Selected via `--tts local`.

Output is raw PCM 16kHz mono 16-bit, played into the virtual sink via `paplay`.

### 6. `transcription/deepgram.ts` — Real-Time Transcription

Pipes audio from the SoX `Readable` stream to Deepgram for real-time transcription.

- Uses Deepgram `nova-2` model with diarization
- Emits events: `transcript`, `utterance-end`
- Audio format: PCM 16kHz mono 16-bit

### 7. `ai/resume-parser.ts` — PDF Resume Extraction

Uses `pdf-parse` to extract text from PDF.

### 8. `ai/candidate-llm.ts` — LLM Candidate Responses

Uses **Gemini 2.5 Flash** (Google GenAI SDK). The `--behavior` parameter controls how the candidate behaves during the interview.

### 9. `orchestrator.ts` — State Machine

Coordinates all components:

1. Parse resume → extract text
2. Create TTS service
3. Create PulseAudio virtual sink
4. Join Teams meeting via Playwright
5. Start SoX audio capture → pipe to Deepgram
6. **Listen loop** (event-driven):
   - On `transcript` (final): accumulate into pending utterance
   - On `utterance-end`: trigger response cycle
   - Response cycle: LLM → TTS → play via virtual sink
7. On SIGINT: leave meeting, remove sink, exit

**State machine:**

```
IDLE → LISTENING → THINKING → SPEAKING → LISTENING → ...
```

- `LISTENING`: Accumulating transcript, waiting for interviewer pause
- `THINKING`: LLM generating response
- `SPEAKING`: TTS audio being played into virtual sink
- While `SPEAKING`, incoming transcript is ignored (self-echo filtering)

---

## Dependencies

```json
{
    "dependencies": {
        "@deepgram/sdk": "^3.9.0",
        "@google/genai": "^1.0.0",
        "dotenv": "^16.4.7",
        "pdf-parse": "^1.1.1",
        "playwright": "^1.52.0"
    },
    "devDependencies": {
        "@types/node": "^22.13.0",
        "tsx": "^4.19.0",
        "typescript": "^5.7.0"
    }
}
```

---

## Environment Variables

```env
# Required
DEEPGRAM_API_KEY=...          # Real-time transcription
GEMINI_API_KEY=...            # Gemini 2.5 Flash for candidate responses

# Optional (TTS)
ELEVENLABS_API_KEY=...        # ElevenLabs TTS (omit to use local piper)
ELEVENLABS_VOICE_ID=...       # Specific voice (default: a neutral male voice)
```

---

## CLI Interface

```
npm run candidate -- --meeting <url> --resume <path.pdf> --name "Name" --behavior "description"
```

| Flag | Required | Description |
|------|----------|-------------|
| `--meeting` | Yes | Teams meeting link |
| `--resume` | Yes | Path to candidate resume PDF |
| `--name` | Yes | Candidate name (used in LLM context and displayed in meeting) |
| `--behavior` | Yes | How the candidate should behave (injected into LLM system prompt) |
| `--tts` | No | TTS backend: `elevenlabs` (default) or `local` |
| `--verbose` | No | Print full transcripts and LLM exchanges to terminal |

---

## System Requirements

- **Linux** with PulseAudio or PipeWire (PulseAudio compatibility layer)
- **SoX** with PulseAudio support: `sudo apt install sox libsox-fmt-pulseaudio`
- **PulseAudio utilities**: `sudo apt install pulseaudio-utils` (for `paplay` and `pactl`)
- **Node.js >= 20**

---

## Limitations & Future Improvements

- **Linux only** — PulseAudio virtual sink + SoX PulseAudio capture = Linux-only
- **No video** — audio only
- **Single interviewer** — assumes 1 interviewer. Panel interviews would need multi-speaker tracking
- **Latency** — ~2-4s between interviewer finishing and agent responding (utterance detection + LLM + TTS)
- **No interruption handling** — agent finishes speaking before processing new input
- **Teams UI changes** — Playwright selectors may break if Teams redesigns the join flow
