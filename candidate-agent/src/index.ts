import "dotenv/config";
import { resolve } from "path";
import { existsSync } from "fs";
import { run, shutdown } from "./orchestrator.js";

export interface CliConfig {
    meeting: string;
    resume: string;
    name: string;
    behavior: string;
    tts: "elevenlabs" | "local";
    verbose: boolean;
}

function parseArgs(): CliConfig {
    const args = process.argv.slice(2);
    const parsed: Record<string, string> = {};
    const flags = new Set<string>();

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith("--")) {
            const eqIdx = arg.indexOf("=");
            if (eqIdx !== -1) {
                parsed[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
            } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                parsed[arg.slice(2)] = args[i + 1];
                i++;
            } else {
                flags.add(arg.slice(2));
            }
        }
    }

    const meeting = parsed["meeting"];
    const resume = parsed["resume"];
    const name = parsed["name"];
    const behavior = parsed["behavior"];

    if (!meeting || !resume || !name || !behavior) {
        console.error("Usage: npm run candidate -- --meeting <url> --resume <path.pdf> --name <name> --behavior <description>");
        console.error("");
        console.error("Required:");
        console.error("  --meeting    Teams meeting link");
        console.error("  --resume     Path to candidate resume PDF");
        console.error("  --name       Candidate display name");
        console.error("  --behavior   How the candidate should behave during the interview");
        console.error("");
        console.error("Optional:");
        console.error('  --tts        TTS backend: "elevenlabs" (default) or "local"');
        console.error("  --verbose    Print full transcripts and LLM exchanges");
        console.error("");
        console.error("Example:");
        console.error('  npm run candidate -- --meeting "https://teams.microsoft.com/meet/..." \\');
        console.error('    --resume ./resume.pdf --name "John Doe" \\');
        console.error('    --behavior "The candidate is a strong senior engineer who aces the interview"');
        process.exit(1);
    }

    const resumePath = resolve(resume);
    if (!existsSync(resumePath)) {
        console.error(`[error] Resume file not found: ${resumePath}`);
        process.exit(1);
    }

    return {
        meeting,
        resume: resumePath,
        name,
        behavior,
        tts: parsed["tts"] === "local" ? "local" : "elevenlabs",
        verbose: flags.has("verbose"),
    };
}

function validateEnv(): void {
    const required: [string, string][] = [
        ["GEMINI_API_KEY", "Gemini API key"],
    ];

    for (const [key, label] of required) {
        const val = process.env[key];
        if (!val || val.startsWith("your_")) {
            console.error(`[error] ${key} is not set (${label}). Edit your .env file.`);
            process.exit(1);
        }
    }
}

const config = parseArgs();
validateEnv();

process.on("SIGINT", async () => {
    console.log("\n[shutdown] Stopping...");
    await shutdown();
    process.exit(0);
});

run(config).catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
});
