import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { EventEmitter } from "events";
import { Readable } from "stream";

export interface TranscriptSegment {
    speaker: number;
    text: string;
    isFinal: boolean;
}

export interface TranscriptionEvents {
    on(event: "transcript", listener: (segment: TranscriptSegment) => void): this;
    on(event: "utterance-end", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close", listener: () => void): this;
}

/**
 * Starts a Deepgram live transcription session, piping audio from a Readable stream.
 */
export function startTranscription(audioStream: Readable, verbose: boolean): {
    emitter: EventEmitter & TranscriptionEvents;
    close: () => void;
    setMuted: (muted: boolean) => void;
} {
    const emitter = new EventEmitter() as EventEmitter & TranscriptionEvents;
    const apiKey = process.env.DEEPGRAM_API_KEY!;
    const deepgram = createClient(apiKey);

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

    let isOpen = false;
    let muted = false;

    connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("[deepgram] Connected");
        isOpen = true;

        // Pipe audio stream to Deepgram (skip while muted)
        audioStream.on("data", (chunk: Buffer) => {
            if (isOpen && !muted) {
                connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
            }
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
            const words = alt.words || [];
            if (words.length > 0) {
                const segments = groupBySpeaker(words);
                for (const seg of segments) {
                    if (verbose) {
                        console.log(`[transcript] [Speaker ${seg.speaker}] ${seg.text}`);
                    }
                    emitter.emit("transcript", { speaker: seg.speaker, text: seg.text, isFinal: true });
                }
            } else {
                if (verbose) {
                    console.log(`[transcript] ${transcript}`);
                }
                emitter.emit("transcript", { speaker: 0, text: transcript, isFinal: true });
            }
        } else {
            emitter.emit("transcript", { speaker: 0, text: transcript, isFinal: false });
        }
    });

    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        emitter.emit("utterance-end");
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error("[deepgram] Error:", err);
        emitter.emit("error", err);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("[deepgram] Connection closed");
        isOpen = false;
        emitter.emit("close");
    });

    function close(): void {
        if (isOpen) {
            connection.requestClose();
        }
    }

    function setMuted(value: boolean): void {
        muted = value;
    }

    return { emitter, close, setMuted };
}

interface SpeakerSegment {
    speaker: number;
    text: string;
}

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
