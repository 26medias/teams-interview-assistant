# Prototype: Real-Time Meeting Transcription

Captures system audio during a Teams meeting and transcribes it in real-time with speaker diarization in the terminal.

## Requirements

### System

- Node.js >= 20
- npm
- SoX audio tool:
    - **Linux**: `sudo apt install sox libsox-fmt-pulseaudio`
    - **macOS**: `brew install sox`

### API Key

| Service | What you need | Where to get it |
|:--------|:-------------|:----------------|
| Deepgram | API key | https://console.deepgram.com/ > API Keys |

Deepgram has a free tier with $200 of credit — more than enough for prototype testing.

## Setup

```bash
cd prototype
npm install
```

Edit `.env` and set your Deepgram API key:

```
DEEPGRAM_API_KEY=your_actual_key_here
```

### Audio Source (Linux)

By default, SoX captures from the PulseAudio/PipeWire `default` source. To capture what you hear (system audio, not your mic), set the source to a monitor device:

```bash
# List available sources
pactl list short sources

# Look for a source ending in .monitor, e.g.:
#   alsa_output.pci-0000_00_1f.3.analog-stereo.monitor
```

Then update the `"default"` argument in `src/audio-capture.ts` to your monitor source name, or set it as your default source:

```bash
pactl set-default-source <monitor_source_name>
```

## Usage

1. Join your Teams meeting normally (browser or desktop app)
2. Run the prototype:

```bash
npm run prototype
```

Output:

```
[init] Starting audio capture...
[init] Make sure your Teams meeting audio is playing through your speakers/headphones.

[deepgram] Connected

[Speaker 0] Tell me about your experience with distributed systems.
[Speaker 1] Sure, I spent the last three years building microservices at...
```

3. Press `Ctrl+C` to stop.
