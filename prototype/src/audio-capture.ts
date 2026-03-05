import { spawn, ChildProcess } from "child_process";
import { Readable } from "stream";

let soxProcess: ChildProcess | null = null;

/**
 * Starts capturing system audio via SoX.
 * Returns a readable stream of raw PCM16 audio (16kHz, mono, signed 16-bit LE).
 *
 * On Linux (PulseAudio/PipeWire): captures from the default monitor source.
 * On macOS: captures from the default input device.
 */
export function startAudioCapture(): Readable {
    const isLinux = process.platform === "linux";

    // SoX args: input → output as raw PCM16 at 16kHz mono
    const args = isLinux
        ? [
              "-t", "pulseaudio",
              "default",        // source — use `pactl list short sources` to find monitor sources
              "-t", "raw",
              "-r", "16000",
              "-c", "1",
              "-e", "signed-integer",
              "-b", "16",
              "-",              // output to stdout
          ]
        : [
              "-d",             // default input device on macOS
              "-t", "raw",
              "-r", "16000",
              "-c", "1",
              "-e", "signed-integer",
              "-b", "16",
              "-",
          ];

    const proc = spawn("sox", args, {
        stdio: ["ignore", "pipe", "pipe"],
    });
    soxProcess = proc;

    proc.stderr!.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        // SoX prints info to stderr — only log actual errors
        if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fail")) {
            console.error(`[audio] SoX error: ${msg}`);
        }
    });

    proc.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            console.error("[audio] SoX is not installed. Install it:");
            console.error("  Linux:  sudo apt install sox libsox-fmt-pulseaudio");
            console.error("  macOS:  brew install sox");
            process.exit(1);
        }
        console.error("[audio] SoX error:", err.message);
    });

    proc.on("close", (code) => {
        if (code !== null && code !== 0) {
            console.error(`[audio] SoX exited with code ${code}`);
        }
    });

    return proc.stdout!;
}

export function stopAudioCapture(): void {
    if (soxProcess) {
        soxProcess.kill("SIGTERM");
        soxProcess = null;
    }
}
