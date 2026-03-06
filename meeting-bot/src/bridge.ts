import { joinMeeting, getPage, leaveMeeting } from "./meeting/join.js";
import { startCaptionScraping } from "./transcription/captions.js";

export interface BridgeConfig {
    meetingUrl: string;
    interviewId: string;
    apiUrl: string;
    botToken: string;
    verbose: boolean;
}

/**
 * Joins a Teams meeting, scrapes live captions, and POSTs transcript
 * segments to the backend API.
 */
export async function run(config: BridgeConfig): Promise<void> {
    const { meetingUrl, interviewId, apiUrl, botToken, verbose } = config;

    // Join the meeting
    await joinMeeting(meetingUrl);

    const page = getPage();
    if (!page) {
        throw new Error("Failed to get page after joining meeting");
    }

    // Start caption scraping
    const { emitter, stop } = await startCaptionScraping(page, verbose);

    const transcriptUrl = `${apiUrl}/api/interviews/${interviewId}/transcript`;

    emitter.on("utterance-end", async (speaker: string, text: string) => {
        const timestamp = new Date().toISOString();
        if (verbose) {
            console.log(`[bridge] Posting transcript: [${speaker}] "${text}"`);
        }

        try {
            const res = await fetch(transcriptUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-bot-token": botToken,
                },
                body: JSON.stringify({ speaker, text, timestamp }),
            });

            if (!res.ok) {
                console.error(
                    `[bridge] POST failed: ${res.status} ${res.statusText}`
                );
            }
        } catch (err) {
            console.error("[bridge] POST error:", err);
        }
    });

    emitter.on("error", (err: Error) => {
        console.error("[bridge] Caption error:", err);
    });

    // Clean shutdown on SIGINT
    const cleanup = async () => {
        console.log("\n[bridge] Shutting down...");
        stop();
        await leaveMeeting();
        process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    console.log("[bridge] Running — capturing captions and posting to API");
    console.log(`[bridge] Transcript endpoint: ${transcriptUrl}`);

    // Keep the process alive
    await new Promise(() => {});
}
