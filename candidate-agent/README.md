# Candidate Agent

AI agent that joins a Microsoft Teams meeting and emulates a job candidate. Give it a resume, a meeting link, and a behavior directive — it joins via the browser, listens to the interviewer, and responds naturally using TTS.

Built for testing the interview assistant end-to-end without needing a real candidate.

## How It Works

1. You start the agent with a meeting link, resume, and behavior description
2. The agent creates a PulseAudio virtual sink for TTS audio routing
3. Playwright opens Chromium and joins the Teams meeting as a guest
4. SoX captures the meeting audio and streams it to Deepgram for transcription
5. When the interviewer pauses, Gemini 2.5 Flash generates a response based on the resume + behavior
6. ElevenLabs (or local piper) converts the response to speech
7. The speech is played into the virtual sink, which routes it into the browser's microphone
8. Press `Ctrl+C` to stop

## Requirements

- **Linux** (PulseAudio/PipeWire required for virtual audio)
- Node.js >= 20
- npm
- SoX with PulseAudio support: `sudo apt install sox libsox-fmt-pulse`
- PulseAudio utilities: `sudo apt install pulseaudio-utils`

### Accounts & API Keys

| Service | What you need | Where to get it | Free tier |
|:--------|:-------------|:----------------|:----------|
| Deepgram | API key | https://console.deepgram.com/ | $200 credit |
| Google AI (Gemini) | API key | https://aistudio.google.com/apikey | Free tier available |
| ElevenLabs (optional) | API key | https://elevenlabs.io/ | 10k chars/month |

## Setup

### 1. Install system dependencies

```bash
sudo apt install sox libsox-fmt-pulse pulseaudio-utils
```

### 2. Install npm dependencies

```bash
cd candidate-agent
npm install
```

### 3. Install Playwright browser

```bash
npx playwright install chromium
```

### 4. Configure environment

Edit `.env` with your keys:

```env
DEEPGRAM_API_KEY=...
GEMINI_API_KEY=...

# Optional
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

### 5. Local TTS setup (skip if using ElevenLabs)

```bash
# Install piper
sudo apt install piper

# Download a voice model
mkdir -p ~/.local/share/piper
cd ~/.local/share/piper
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

Then run with `--tts local`.

## Usage

```bash
npm run candidate -- --meeting <url> --resume <path.pdf> --name "Candidate Name" --behavior "description"
```

### Options

| Flag | Required | Description |
|------|----------|-------------|
| `--meeting` | Yes | Teams meeting link |
| `--resume` | Yes | Path to candidate resume PDF |
| `--name` | Yes | Candidate name (used in AI context and displayed in meeting) |
| `--behavior` | Yes | How the candidate should behave (controls AI personality) |
| `--tts` | No | TTS backend: `elevenlabs` (default) or `local` |
| `--verbose` | No | Print full transcripts and LLM exchanges |

### Behavior Examples

```bash
# Strong senior candidate
--behavior "The candidate is a strong senior engineer who aces the interview with detailed, confident answers"

# Candidate who lied on resume
--behavior "The candidate has lied on their resume and does not know any details of the implementations. They get flustered when pressed for specifics"

# Nervous junior
--behavior "The candidate is a nervous junior developer who gives short, uncertain answers but has genuine knowledge"

# Evasive candidate
--behavior "The candidate avoids direct answers, talks in circles, and tries to change the subject when asked hard questions"
```

### Full Example

```bash
npm run candidate -- \
    --meeting "https://teams.microsoft.com/meet/123456?p=abc" \
    --resume ./resumes/john-doe.pdf \
    --name "John Doe" \
    --behavior "The candidate is a strong senior engineer who aces the interview" \
    --verbose
```

### Stopping

Press `Ctrl+C`. The agent will:
- Stop audio playback and capture
- Close the Deepgram connection
- Leave the meeting and close the browser
- Remove the PulseAudio virtual sink
- Exit cleanly

## Architecture

```
Playwright joins Teams meeting via browser
    |
    +---> SoX captures system audio (meeting audio)
    |         |
    |         v
    |     Deepgram transcribes in real-time
    |         |
    |         v (on utterance end)
    |     Gemini 2.5 Flash generates response
    |     (resume + behavior + history)
    |         |
    |         v
    |     TTS converts text -> PCM audio
    |         |
    |         v
    +<--- paplay sends audio to PulseAudio virtual sink
              |
              v
          Browser picks up audio as microphone input
              |
              v
          Teams meeting hears the candidate
```

## Limitations

- **Linux only** — requires PulseAudio/PipeWire for virtual audio routing
- **Audio only** — no video
- **Single interviewer** — panel interviews not supported
- **~2-4s response latency** — utterance detection + LLM + TTS
- **No interruption handling** — agent finishes speaking before processing new input
- **Teams web UI may change** — Playwright selectors may need updating if Teams redesigns the join flow
