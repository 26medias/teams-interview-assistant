import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { Readable } from "stream";

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey || apiKey === "YOUR_DEEPGRAM_API_KEY") {
    console.error("[error] DEEPGRAM_API_KEY is not set. Edit your .env file.");
    process.exit(1);
}

const deepgram = createClient(apiKey);

/**
 * Starts streaming audio to Deepgram for real-time transcription.
 * Prints transcription with speaker labels to the terminal.
 */
export function startTranscription(audioStream: Readable): void {
    const connection = deepgram.listen.live({
        model: "nova-2",
        language: "en",
        smart_format: true,
        diarize: true,
        interim_results: true,
        utterance_end_ms: 1500,
        vad_events: true,
        encoding: "linear16",
        sample_rate: 16000,
        channels: 1,
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("[deepgram] Connected\n");

        // Pipe audio data to Deepgram
        audioStream.on("data", (chunk: Buffer) => {
            connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
        });

        audioStream.on("end", () => {
            connection.requestClose();
        });
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const alt = data.channel?.alternatives?.[0];
        if (!alt?.transcript) return;

        const transcript = alt.transcript.trim();
        if (!transcript) return;

        const isFinal = data.is_final;

        if (isFinal) {
            // Build speaker-attributed output from words
            const words = alt.words || [];
            if (words.length > 0) {
                const segments = groupBySpeaker(words);
                for (const seg of segments) {
                    process.stdout.write(`\r\x1b[K[Speaker ${seg.speaker}] ${seg.text}\n`);
                }
            } else {
                process.stdout.write(`\r\x1b[K${transcript}\n`);
            }
        } else {
            // Interim: show on same line
            process.stdout.write(`\r\x1b[K  ... ${transcript}`);
        }
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error("[deepgram] Error:", err);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("\n[deepgram] Connection closed");
    });
}

interface SpeakerSegment {
    speaker: number;
    text: string;
}

/**
 * Groups consecutive words by speaker into segments.
 */
function groupBySpeaker(words: Array<{ speaker?: number; punctuated_word?: string; word?: string }>): SpeakerSegment[] {
    const segments: SpeakerSegment[] = [];
    let current: SpeakerSegment | null = null;

    for (const w of words) {
        const speaker = w.speaker ?? 0;
        const word = w.punctuated_word || w.word || "";

        if (!current || current.speaker !== speaker) {
            if (current) segments.push(current);
            current = { speaker, text: word };
        } else {
            current.text += " " + word;
        }
    }

    if (current) segments.push(current);
    return segments;
}
