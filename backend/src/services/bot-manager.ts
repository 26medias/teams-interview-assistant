import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { config } from "../config.js";
import { generateBotToken } from "./auth.js";

// Track running bot processes per interview
const runningBots = new Map<string, ChildProcess>();

/**
 * Spawns a meeting-bot process that joins the Teams meeting and
 * streams transcript segments back to this server.
 */
export function startBot(interviewId: string, meetingLink: string): void {
    if (runningBots.has(interviewId)) {
        console.log(`[bot-manager] Bot already running for interview ${interviewId}`);
        return;
    }

    const botToken = generateBotToken(interviewId);
    const botDir = config.botPath;
    const apiUrl = `http://localhost:${config.port}`;

    const proc = spawn("npx", [
        "tsx", "src/index.ts",
        "--meeting", meetingLink,
        "--interview-id", interviewId,
        "--api-url", apiUrl,
        "--token", botToken,
    ], {
        cwd: join(process.cwd(), botDir),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BOT_TOKEN: botToken },
    });

    runningBots.set(interviewId, proc);

    proc.stdout?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[bot:${interviewId.slice(0, 8)}] ${msg}`);
    });

    proc.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[bot:${interviewId.slice(0, 8)}] ${msg}`);
    });

    proc.on("close", (code) => {
        runningBots.delete(interviewId);
        console.log(`[bot-manager] Bot for ${interviewId.slice(0, 8)} exited (code ${code})`);
    });

    proc.on("error", (err) => {
        runningBots.delete(interviewId);
        console.error(`[bot-manager] Failed to start bot:`, err.message);
    });

    console.log(`[bot-manager] Started bot for interview ${interviewId.slice(0, 8)}`);
}

/**
 * Stops the meeting bot for a given interview.
 */
export function stopBot(interviewId: string): void {
    const proc = runningBots.get(interviewId);
    if (proc) {
        proc.kill("SIGINT");
        runningBots.delete(interviewId);
        console.log(`[bot-manager] Stopped bot for interview ${interviewId.slice(0, 8)}`);
    }
}

/**
 * Stop all running bots (on server shutdown).
 */
export function stopAllBots(): void {
    for (const [id, proc] of runningBots) {
        proc.kill("SIGINT");
        console.log(`[bot-manager] Stopped bot for interview ${id.slice(0, 8)}`);
    }
    runningBots.clear();
}

export function isBotRunning(interviewId: string): boolean {
    return runningBots.has(interviewId);
}
