import "dotenv/config";
import { startAudioCapture, stopAudioCapture } from "./audio-capture.js";
import { startTranscription } from "./transcription.js";

function main() {
    console.log("[init] Starting audio capture...");
    console.log("[init] Make sure your Teams meeting audio is playing through your speakers/headphones.\n");

    const audioStream = startAudioCapture();
    startTranscription(audioStream);
}

process.on("SIGINT", () => {
    console.log("\n[shutdown] Stopping...");
    stopAudioCapture();
    process.exit(0);
});

main();
