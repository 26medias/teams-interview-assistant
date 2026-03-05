import { spawn, ChildProcess } from "child_process";
import { Readable } from "stream";

let soxProcess: ChildProcess | null = null;

/**
 * Starts capturing system audio via SoX + PulseAudio.
 * Returns a readable stream of raw PCM16 audio (16kHz, mono, signed 16-bit LE).
 *
 * Captures from the PulseAudio default monitor source, which picks up
 * all audio playing through the system (i.e., the Teams meeting audio).
 */
export function startAudioCapture(): Readable {
    const isLinux = process.platform === "linux";

    const args = isLinux
        ? [
              "-t", "pulseaudio",
              "default",
              "-t", "raw",
              "-r", "16000",
              "-c", "1",
              "-e", "signed-integer",
              "-b", "16",
              "-",
          ]
        : [
              "-d",
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
        if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fail")) {
            console.error(`[audio] SoX error: ${msg}`);
        }
    });

    proc.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            console.error("[audio] SoX is not installed. Install it:");
            console.error("  sudo apt install sox libsox-fmt-pulse");
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

/**
 * Stops the SoX capture process.
 */
export function stopAudioCapture(): void {
    if (soxProcess) {
        soxProcess.kill("SIGTERM");
        soxProcess = null;
    }
}
