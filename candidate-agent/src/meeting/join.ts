import { chromium, Browser, Page, BrowserContext } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export function getPage(): Page | null {
    return page;
}

/**
 * Joins a Teams meeting via Playwright in a Chromium browser.
 * Sets up the outbound audio pipeline (TTS → WebRTC) via Web Audio API.
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

    // Forward select browser console messages to Node.js
    const seenMessages = new Set<string>();
    page.on("console", (msg) => {
        const text = msg.text();
        if (!text.startsWith("[candidate-agent]")) return;
        // Deduplicate one-time messages (addInitScript runs per frame)
        if (text.includes("pipeline") || text.includes("injected")) {
            if (seenMessages.has(text)) return;
            seenMessages.add(text);
        }
        console.log(text);
    });

    // Inject TTS → WebRTC audio pipeline BEFORE Teams loads.
    await page.addInitScript(() => {
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

        (window as any).__audioCtx = audioCtx;
        (window as any).__audioDest = dest;
        (window as any).__audioTrack = ourAudioTrack;

        console.log("[candidate-agent] Audio pipeline ready");

        // Play PCM16 audio into the WebRTC stream
        (window as any).__playAudio = async (base64PCM: string, inputSampleRate: number) => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }

            const binary = atob(base64PCM);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const evenLen = bytes.length & ~1;
            const int16 = new Int16Array(bytes.buffer, 0, evenLen / 2);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768;
            }

            const audioBuffer = audioCtx.createBuffer(1, float32.length, inputSampleRate);
            audioBuffer.copyToChannel(float32, 0);

            // Minimal logging — only duration
            console.log(`[candidate-agent] Playing ${(float32.length / inputSampleRate).toFixed(1)}s of audio`);

            return new Promise<void>((resolve) => {
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(dest);
                source.onended = () => resolve();
                source.start();
            });
        };

        // Override getUserMedia to inject our custom audio track
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            const stream = await origGetUserMedia(constraints);

            if (constraints && constraints.audio) {
                stream.getAudioTracks().forEach((t) => {
                    stream.removeTrack(t);
                    t.stop();
                });
                stream.addTrack(ourAudioTrack);
                console.log("[candidate-agent] Audio track injected");
            }

            return stream;
        };

        // Intercept RTCPeerConnection.addTrack for outbound audio
        const origAddTrack = RTCPeerConnection.prototype.addTrack;
        RTCPeerConnection.prototype.addTrack = function (track, ...streams) {
            if (track.kind === "audio" && track.id !== ourAudioTrack.id) {
                track.stop();
                return origAddTrack.call(this, ourAudioTrack, ...streams);
            }
            return origAddTrack.call(this, track, ...streams);
        };

        // Intercept replaceTrack on senders to keep our track
        const origReplaceTrack = RTCRtpSender.prototype.replaceTrack;
        RTCRtpSender.prototype.replaceTrack = function (track) {
            if (track && track.kind === "audio" && track.id !== ourAudioTrack.id) {
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
 * Plays PCM16 16kHz mono audio into the meeting's mic stream.
 */
export async function playAudioInMeeting(pcmBuffer: Buffer): Promise<void> {
    if (!page) {
        console.error("[meeting] Cannot play audio — not in a meeting");
        return;
    }

    const base64 = pcmBuffer.toString("base64");
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
