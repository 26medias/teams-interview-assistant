import { chromium, Browser, Page, BrowserContext } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * Joins a Teams meeting via Playwright in a Chromium browser.
 * Injects a custom audio pipeline via Web Audio API so we can
 * play TTS audio directly into the WebRTC mic stream.
 */
export async function joinMeeting(
    meetingUrl: string,
    displayName: string,
): Promise<void> {
    console.log("[meeting] Launching browser...");

    browser = await chromium.launch({
        headless: false,
        args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
        ],
    });

    context = await browser.newContext({
        permissions: ["microphone", "camera"],
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    page = await context.newPage();

    // Forward browser console to Node.js for debugging
    page.on("console", (msg) => {
        const text = msg.text();
        if (text.startsWith("[candidate-agent]")) {
            console.log(text);
        }
    });

    // Inject audio pipeline BEFORE Teams loads.
    // Overrides getUserMedia so Teams gets our custom audio stream,
    // and intercepts RTCPeerConnection to ensure our audio track is used.
    await page.addInitScript(() => {
        // Use 48kHz to match WebRTC's expected sample rate
        const audioCtx = new AudioContext({ sampleRate: 48000 });
        const dest = audioCtx.createMediaStreamDestination();

        // Silent oscillator keeps the stream/track alive
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();

        const ourAudioTrack = dest.stream.getAudioTracks()[0];

        // Expose globally
        (window as any).__audioCtx = audioCtx;
        (window as any).__audioDest = dest;
        (window as any).__audioTrack = ourAudioTrack;

        console.log("[candidate-agent] Audio pipeline initialized, track:", ourAudioTrack.id);

        // Play PCM16 audio into the WebRTC stream. Returns when playback finishes.
        (window as any).__playAudio = async (base64PCM: string, inputSampleRate: number) => {
            // Ensure AudioContext is running
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }

            // Decode base64 to Int16 PCM
            const binary = atob(base64PCM);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const evenLen = bytes.length & ~1; // Int16Array needs even byte count
            const int16 = new Int16Array(bytes.buffer, 0, evenLen / 2);

            // Convert Int16 to Float32
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768;
            }

            // Create buffer at the input sample rate, AudioContext will resample
            const audioBuffer = audioCtx.createBuffer(1, float32.length, inputSampleRate);
            audioBuffer.copyToChannel(float32, 0);

            console.log(`[candidate-agent] Playing audio: ${float32.length} samples at ${inputSampleRate}Hz (${(float32.length / inputSampleRate).toFixed(1)}s)`);

            return new Promise<void>((resolve) => {
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(dest);
                source.onended = () => {
                    console.log("[candidate-agent] Audio playback finished");
                    resolve();
                };
                source.start();
            });
        };

        // Override getUserMedia to inject our custom audio track
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            console.log("[candidate-agent] getUserMedia called:", JSON.stringify(constraints));
            const stream = await origGetUserMedia(constraints);

            if (constraints && constraints.audio) {
                // Replace the fake audio track with ours
                stream.getAudioTracks().forEach((t) => {
                    stream.removeTrack(t);
                    t.stop();
                });
                stream.addTrack(ourAudioTrack);
                console.log("[candidate-agent] Replaced audio track in getUserMedia stream");
            }

            return stream;
        };

        // Intercept RTCPeerConnection.addTrack to ensure our audio track is used
        const origAddTrack = RTCPeerConnection.prototype.addTrack;
        RTCPeerConnection.prototype.addTrack = function (track, ...streams) {
            if (track.kind === "audio" && track.id !== ourAudioTrack.id) {
                console.log("[candidate-agent] RTCPeerConnection.addTrack intercepted — replacing audio track");
                track.stop();
                return origAddTrack.call(this, ourAudioTrack, ...streams);
            }
            return origAddTrack.call(this, track, ...streams);
        };

        // Intercept replaceTrack on senders to keep our track
        const origReplaceTrack = RTCRtpSender.prototype.replaceTrack;
        RTCRtpSender.prototype.replaceTrack = function (track) {
            if (track && track.kind === "audio" && track.id !== ourAudioTrack.id) {
                console.log("[candidate-agent] RTCRtpSender.replaceTrack intercepted — keeping our audio track");
                return origReplaceTrack.call(this, ourAudioTrack);
            }
            return origReplaceTrack.call(this, track);
        };
    });

    // Navigate to the meeting link
    console.log("[meeting] Navigating to Teams meeting...");
    await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Teams shows a "How do you want to join?" page — click "Continue on this browser"
    try {
        const continueBtn = page.getByRole("button", { name: /continue on this browser/i });
        await continueBtn.waitFor({ timeout: 15000 });
        await continueBtn.click();
        console.log("[meeting] Clicked 'Continue on this browser'");
    } catch {
        console.log("[meeting] Skipped browser selection (not shown)");
    }

    // Fill in the name field
    try {
        const nameInput = page.locator('input[placeholder*="name" i], input[data-tid="prejoin-display-name-input"]');
        await nameInput.waitFor({ timeout: 10000 });
        await nameInput.fill(displayName);
        console.log(`[meeting] Set display name: ${displayName}`);
    } catch {
        console.log("[meeting] Name field not found (may already be set)");
    }

    // Turn off camera if toggle is visible
    try {
        const cameraToggle = page.locator('[data-tid="toggle-video"], button[aria-label*="camera" i][aria-pressed="true"]');
        if (await cameraToggle.isVisible({ timeout: 3000 })) {
            await cameraToggle.click();
            console.log("[meeting] Turned off camera");
        }
    } catch {
        // Camera may already be off
    }

    // Click "Join now"
    try {
        const joinBtn = page.getByRole("button", { name: /join now/i });
        await joinBtn.waitFor({ timeout: 10000 });
        await joinBtn.click();
        console.log("[meeting] Clicked 'Join now'");
    } catch {
        console.error("[meeting] Could not find 'Join now' button");
        throw new Error("Failed to join meeting — 'Join now' button not found");
    }

    // Wait for the meeting to connect
    await page.waitForTimeout(3000);
    console.log("[meeting] Joined meeting");
}

/**
 * Plays PCM16 16kHz mono audio into the meeting's mic stream
 * via the injected Web Audio API pipeline.
 */
export async function playAudioInMeeting(pcmBuffer: Buffer): Promise<void> {
    if (!page) {
        console.error("[meeting] Cannot play audio — not in a meeting");
        return;
    }

    const base64 = pcmBuffer.toString("base64");
    console.log(`[meeting] Sending ${pcmBuffer.length} bytes of audio to browser...`);

    await page.evaluate(
        async ({ data, rate }) => {
            await (window as any).__playAudio(data, rate);
        },
        { data: base64, rate: 16000 },
    );
}

/**
 * Leaves the meeting and closes the browser.
 */
export async function leaveMeeting(): Promise<void> {
    if (page) {
        try {
            const hangUpBtn = page.locator('[data-tid="hangup-button"], button[aria-label*="hang up" i], button[aria-label*="leave" i]');
            if (await hangUpBtn.isVisible({ timeout: 2000 })) {
                await hangUpBtn.click();
                console.log("[meeting] Left meeting");
            }
        } catch {
            // Best effort
        }
        page = null;
    }

    if (context) {
        await context.close();
        context = null;
    }

    if (browser) {
        await browser.close();
        browser = null;
        console.log("[meeting] Browser closed");
    }
}
