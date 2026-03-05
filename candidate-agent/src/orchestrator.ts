import type { CliConfig } from "./index.js";
import { parseResume } from "./ai/resume-parser.js";
import { generateResponse, ConversationTurn } from "./ai/candidate-llm.js";
import { createTTSService, TTSService } from "./audio/tts.js";
import { startAudioCapture, stopAudioCapture } from "./audio/capture.js";
import { startTranscription } from "./transcription/deepgram.js";
import { joinMeeting, playAudioInMeeting, leaveMeeting } from "./meeting/join.js";

type AgentState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING";

const FILLER_PHRASES = [
    "Hmm, let me think about that.",
    "That's a great question.",
    "So, uh...",
    "Right, so...",
    "Let me think...",
    "Hmm...",
    "Yeah, so...",
];

let state: AgentState = "IDLE";
let deepgramClose: (() => void) | null = null;
let deepgramSetMuted: ((muted: boolean) => void) | null = null;
let pendingUtterance = "";
const conversationHistory: ConversationTurn[] = [];
let fillerBuffers: Buffer[] = [];

/**
 * Pre-generate filler phrase audio at startup so they can be played instantly.
 */
async function preloadFillers(tts: TTSService): Promise<void> {
    console.log("[init] Pre-generating filler phrases...");
    const results = await Promise.allSettled(
        FILLER_PHRASES.map((phrase) => tts.synthesize(phrase)),
    );
    fillerBuffers = results
        .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === "fulfilled")
        .map((r) => r.value);
    console.log(`[init] ${fillerBuffers.length}/${FILLER_PHRASES.length} fillers ready`);
}

function getRandomFiller(): Buffer | null {
    if (fillerBuffers.length === 0) return null;
    return fillerBuffers[Math.floor(Math.random() * fillerBuffers.length)];
}

export async function run(config: CliConfig): Promise<void> {
    // 1. Parse resume
    const resumeText = await parseResume(config.resume);

    // 2. Create TTS service
    const tts = createTTSService(config.tts);
    console.log(`[init] TTS backend: ${config.tts}`);

    // 3. Pre-generate filler phrases
    await preloadFillers(tts);

    // 4. Join the Teams meeting via Playwright
    await joinMeeting(config.meeting, config.name);

    // 5. Start audio capture (SoX captures system audio including meeting)
    console.log("[init] Starting audio capture...");
    const audioStream = startAudioCapture();

    // 6. Start Deepgram transcription from the audio stream
    const transcription = startTranscription(audioStream, config.verbose);
    deepgramClose = transcription.close;
    deepgramSetMuted = transcription.setMuted;
    state = "LISTENING";
    console.log("[agent] Listening...\n");

    // 7. Handle transcription events
    transcription.emitter.on("transcript", (segment) => {
        if (!segment.isFinal) return;
        if (state !== "LISTENING") return;
        pendingUtterance += (pendingUtterance ? " " : "") + segment.text;
    });

    transcription.emitter.on("utterance-end", async () => {
        if (state !== "LISTENING" || !pendingUtterance.trim()) return;

        const utterance = pendingUtterance.trim();
        pendingUtterance = "";

        await respondToUtterance(utterance, resumeText, config.name, config.behavior, tts, config.verbose);
    });

    transcription.emitter.on("error", (err) => {
        console.error("[agent] Transcription error:", err);
    });
}

async function respondToUtterance(
    utterance: string,
    resumeText: string,
    candidateName: string,
    behavior: string,
    tts: TTSService,
    verbose: boolean,
): Promise<void> {
    console.log(`[agent] Interviewer: "${utterance.slice(0, 100)}${utterance.length > 100 ? "..." : ""}"`);

    conversationHistory.push({ role: "interviewer", text: utterance });

    // Mute Deepgram so we don't hear ourselves
    deepgramSetMuted?.(true);

    // Play a filler phrase immediately while we think
    state = "THINKING";
    console.log("[agent] Thinking...");
    const filler = getRandomFiller();
    const fillerPromise = filler ? playAudioInMeeting(filler).catch(() => {}) : Promise.resolve();

    // Generate LLM response in parallel with filler playback
    let responseText: string;
    try {
        const [text] = await Promise.all([
            generateResponse(resumeText, candidateName, behavior, conversationHistory, verbose),
            fillerPromise,
        ]);
        responseText = text;
    } catch (err) {
        console.error("[agent] LLM error — skipping response:", err);
        resumeListening();
        return;
    }

    conversationHistory.push({ role: "candidate", text: responseText });
    console.log(`[agent] Responding: "${responseText.slice(0, 100)}${responseText.length > 100 ? "..." : ""}"`);

    // Synthesize speech
    state = "SPEAKING";
    let pcmBuffer: Buffer;
    try {
        pcmBuffer = await tts.synthesize(responseText);
    } catch (err) {
        console.error("[agent] TTS error — skipping response:", err);
        resumeListening();
        return;
    }

    // Play audio into the meeting
    try {
        await playAudioInMeeting(pcmBuffer);
    } catch (err) {
        console.error("[agent] Playback error:", err);
    }

    resumeListening();
}

function resumeListening(): void {
    // Clear any transcript fragments that arrived while we were speaking
    pendingUtterance = "";

    // Unmute Deepgram
    deepgramSetMuted?.(false);

    state = "LISTENING";
    console.log("[agent] Listening...\n");
}

export async function shutdown(): Promise<void> {
    state = "IDLE";

    stopAudioCapture();

    if (deepgramClose) {
        deepgramClose();
        deepgramClose = null;
    }

    await leaveMeeting();
}
