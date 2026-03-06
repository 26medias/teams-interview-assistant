import type { CliConfig } from "./index.js";
import { parseResume } from "./ai/resume-parser.js";
import { generateResponse, ConversationTurn } from "./ai/candidate-llm.js";
import { createTTSService, TTSService } from "./audio/tts.js";
import { startCaptionScraping } from "./transcription/captions.js";
import { joinMeeting, getPage, playAudioInMeeting, leaveMeeting } from "./meeting/join.js";

type AgentState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING";

let state: AgentState = "IDLE";
let captionsStop: (() => void) | null = null;
let captionsReset: (() => Promise<void>) | null = null;
const conversationHistory: ConversationTurn[] = [];

/**
 * Split text into sentences for pipelined TTS.
 * Avoids splitting on abbreviations (U.S.S., Dr., etc.) or decimal numbers.
 */
function splitSentences(text: string): string[] {
    // Split on sentence-ending punctuation followed by a space and uppercase letter (or end of string)
    // This avoids splitting on "U.S.S." or "Dr." or "3.5"
    const parts: string[] = [];
    let current = "";

    for (let i = 0; i < text.length; i++) {
        current += text[i];

        if (text[i] === "." || text[i] === "!" || text[i] === "?") {
            // Check if this looks like a real sentence end:
            // - end of string, OR
            // - followed by space + uppercase letter, OR
            // - followed by newline
            const rest = text.slice(i + 1);
            const isEnd = rest.length === 0 ||
                /^\s+[A-Z]/.test(rest) ||
                /^\s*\n/.test(rest) ||
                // Also split on "?" and "!" more aggressively (they're rarely abbreviations)
                (text[i] !== "." && /^\s/.test(rest));

            if (isEnd && current.trim().length > 0) {
                parts.push(current.trim());
                current = "";
            }
        }
    }

    if (current.trim().length > 0) {
        parts.push(current.trim());
    }

    return parts.length > 0 ? parts : [text];
}

export async function run(config: CliConfig): Promise<void> {
    // 1. Parse resume
    const resumeText = await parseResume(config.resume);

    // 2. Create TTS service
    const tts = createTTSService(config.tts);
    console.log(`[init] TTS backend: ${config.tts}`);

    // 3. Join the Teams meeting via Playwright
    await joinMeeting(config.meeting, config.name);

    const page = getPage();
    if (!page) {
        throw new Error("Failed to get Playwright page after joining meeting");
    }

    // 4. Start caption scraping
    const captions = await startCaptionScraping(page, config.name, config.verbose);
    captionsStop = captions.stop;
    captionsReset = captions.reset;
    state = "LISTENING";
    console.log("[agent] Listening...\n");

    // 5. Handle caption events
    captions.emitter.on("utterance-end", async (_speaker, text) => {
        if (state !== "LISTENING" || !text.trim()) return;
        await respondToUtterance(text.trim(), resumeText, config.name, config.behavior, tts, config.verbose);
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
    state = "THINKING";
    console.log(`[interviewer] "${utterance}"`);

    conversationHistory.push({ role: "interviewer", text: utterance });

    // Generate LLM response
    let responseText: string;
    try {
        responseText = await generateResponse(resumeText, candidateName, behavior, conversationHistory, verbose);
    } catch (err) {
        console.error("[agent] LLM error — skipping:", err);
        await resumeListening();
        return;
    }

    if (!responseText || !responseText.trim()) {
        console.warn("[agent] LLM returned empty response — skipping");
        await resumeListening();
        return;
    }

    conversationHistory.push({ role: "candidate", text: responseText });
    console.log(`[candidate] "${responseText}"`);

    // Split into sentences and synthesize with limited concurrency (ElevenLabs allows max 3)
    state = "SPEAKING";
    const sentences = splitSentences(responseText).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) {
        console.warn("[agent] No sentences to speak — skipping");
        await resumeListening();
        return;
    }
    const MAX_CONCURRENT_TTS = 2;

    const pending: Promise<Buffer>[] = [];
    let nextIdx = 0;
    for (let i = 0; i < Math.min(MAX_CONCURRENT_TTS, sentences.length); i++) {
        pending.push(tts.synthesize(sentences[nextIdx++]));
    }

    for (let i = 0; i < sentences.length; i++) {
        try {
            const pcmBuffer = await pending[i];
            if (nextIdx < sentences.length) {
                pending.push(tts.synthesize(sentences[nextIdx++]));
            }
            await playAudioInMeeting(pcmBuffer);
        } catch (err) {
            console.error("[agent] TTS/playback error:", err);
            if (nextIdx < sentences.length) {
                pending.push(tts.synthesize(sentences[nextIdx++]));
            }
        }
    }

    await resumeListening();
}

async function resumeListening(): Promise<void> {
    // Snapshot current captions so we ignore the agent's own residual speech
    if (captionsReset) {
        await captionsReset();
    }
    state = "LISTENING";
    console.log("[agent] Listening...\n");
}

export async function shutdown(): Promise<void> {
    state = "IDLE";

    if (captionsStop) {
        captionsStop();
        captionsStop = null;
    }

    await leaveMeeting();
}
