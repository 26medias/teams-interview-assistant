import "dotenv/config";
import { run } from "./bridge.js";

// dotenv may override BOT_TOKEN with empty string from .env file.
// Prefer the value passed via CLI --token over env var.

function parseArgs(): {
    meetingUrl: string;
    interviewId: string;
    apiUrl: string;
    botToken: string;
    verbose: boolean;
} {
    const args = process.argv.slice(2);
    let meetingUrl = "";
    let interviewId = "";
    let apiUrl = "";
    let botToken = process.env.BOT_TOKEN || "";
    let verbose = false;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--meeting":
                meetingUrl = args[++i] || "";
                break;
            case "--interview-id":
                interviewId = args[++i] || "";
                break;
            case "--api-url":
                apiUrl = args[++i] || "";
                break;
            case "--token":
                botToken = args[++i] || "";
                break;
            case "--verbose":
                verbose = true;
                break;
            default:
                console.error(`Unknown argument: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!meetingUrl) {
        console.error("Missing required argument: --meeting <url>");
        process.exit(1);
    }
    if (!interviewId) {
        console.error("Missing required argument: --interview-id <id>");
        process.exit(1);
    }
    if (!apiUrl) {
        console.error("Missing required argument: --api-url <url>");
        process.exit(1);
    }
    if (!botToken) {
        console.error("Missing BOT_TOKEN env var or --token argument");
        process.exit(1);
    }

    return { meetingUrl, interviewId, apiUrl, botToken, verbose };
}

const config = parseArgs();

run({
    meetingUrl: config.meetingUrl,
    interviewId: config.interviewId,
    apiUrl: config.apiUrl,
    botToken: config.botToken,
    verbose: config.verbose,
}).catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
});
