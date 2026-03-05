import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface TTSService {
    /** Returns raw PCM16 audio at 16kHz mono */
    synthesize(text: string): Promise<Buffer>;
}

export function createTTSService(backend: "elevenlabs" | "local"): TTSService {
    if (backend === "elevenlabs") {
        return new ElevenLabsTTS();
    }
    return new PiperTTS();
}

/**
 * ElevenLabs TTS — high quality, API-based.
 * Requests PCM 16kHz output directly to match ACS format.
 */
class ElevenLabsTTS implements TTSService {
    private apiKey: string;
    private voiceId: string;

    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY || "";
        this.voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // "Adam"

        if (!this.apiKey || this.apiKey.startsWith("your_")) {
            throw new Error(
                "ELEVENLABS_API_KEY is not set. Set it in .env or use --tts local for local TTS."
            );
        }
    }

    async synthesize(text: string): Promise<Buffer> {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_16000`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": this.apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}

/**
 * Piper TTS — local, no API key needed.
 * Outputs raw PCM at 16kHz mono 16-bit.
 */
class PiperTTS implements TTSService {
    private modelPath: string;

    constructor() {
        const defaultPath = join(homedir(), ".local/share/piper/en_US-lessac-medium.onnx");
        this.modelPath = process.env.PIPER_MODEL_PATH || defaultPath;

        if (!existsSync(this.modelPath)) {
            throw new Error(
                `Piper voice model not found at ${this.modelPath}. ` +
                "Download it from https://github.com/rhasspy/piper or set PIPER_MODEL_PATH."
            );
        }
    }

    synthesize(text: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];

            // Piper reads from stdin, writes raw PCM to stdout
            // --output-raw + --length-scale for natural pacing
            const proc = spawn("piper", [
                "--model", this.modelPath,
                "--output-raw",
                "--sample_rate", "16000",
            ], {
                stdio: ["pipe", "pipe", "pipe"],
            });

            proc.stdout!.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
            });

            proc.stderr!.on("data", (data: Buffer) => {
                const msg = data.toString().trim();
                if (msg.toLowerCase().includes("error")) {
                    console.error(`[tts] Piper error: ${msg}`);
                }
            });

            proc.on("error", (err) => {
                if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                    reject(new Error("piper is not installed. See README for install instructions."));
                } else {
                    reject(err);
                }
            });

            proc.on("close", (code) => {
                if (code === 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`piper exited with code ${code}`));
                }
            });

            proc.stdin!.write(text);
            proc.stdin!.end();
        });
    }
}
