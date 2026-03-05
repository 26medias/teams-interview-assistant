import { spawn, execSync, ChildProcess } from "child_process";
import { Readable } from "stream";

let soxProcess: ChildProcess | null = null;

/**
 * Gets the monitor source for the current default output sink.
 * This captures all audio playing through the system (meeting audio)
 * without changing the system's default source setting.
 */
function getOutputMonitorSource(): string {
    try {
        const defaultSink = execSync("pactl get-default-sink", { encoding: "utf-8" }).trim();
        const monitor = `${defaultSink}.monitor`;
        console.log(`[audio] Capturing from: ${monitor}`);
        return monitor;
    } catch {
        console.warn("[audio] Could not detect default sink, falling back to 'default'");
        return "default";
    }
}

/**
 * Starts capturing system audio via SoX.
 * Returns a readable stream of raw PCM16 audio (16kHz, mono, signed 16-bit LE).
 *
 * On Linux: captures from the default output sink's monitor (loopback).
 * On macOS: captures from the default input device.
 */
export function startAudioCapture(): Readable {
    const isLinux = process.platform === "linux";
    const source = isLinux ? getOutputMonitorSource() : undefined;

    const args = isLinux
        ? [
              "-t", "pulseaudio",
              source!,
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
            console.error("  Linux:  sudo apt install sox libsox-fmt-pulse");
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
