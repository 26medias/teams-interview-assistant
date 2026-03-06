import { chromium, Browser, Page, BrowserContext } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export function getPage(): Page | null {
    return page;
}

/**
 * Joins a Teams meeting via Playwright in a Chromium browser.
 * No audio injection — the bot is a passive observer that scrapes captions.
 */
export async function joinMeeting(meetingUrl: string): Promise<void> {
    console.log("[meeting] Launching browser...");

    browser = await chromium.launch({
        headless: false,
        args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
        ],
    });

    context = await browser.newContext({
        permissions: ["microphone", "camera"],
        userAgent:
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    page = await context.newPage();

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
        const nameInput = page.locator(
            'input[placeholder*="name" i], input[data-tid="prejoin-display-name-input"]'
        );
        await nameInput.waitFor({ timeout: 10000 });
        await nameInput.fill("Meeting Transcript Recorder");
        console.log("[meeting] Set display name: Meeting Transcript Recorder");
    } catch {
        console.log("[meeting] Name field not found (may already be set)");
    }

    // Turn off camera if toggle is visible
    try {
        const cameraToggle = page.locator(
            '[data-tid="toggle-video"], button[aria-label*="camera" i][aria-pressed="true"]'
        );
        if (await cameraToggle.isVisible({ timeout: 3000 })) {
            await cameraToggle.click();
            console.log("[meeting] Turned off camera");
        }
    } catch {
        // Camera may already be off
    }

    // Turn off mic if toggle is visible
    try {
        const micToggle = page.locator(
            '[data-tid="toggle-mute"], button[aria-label*="microphone" i][aria-pressed="true"], button[aria-label*="mic" i][aria-pressed="true"]'
        );
        if (await micToggle.isVisible({ timeout: 3000 })) {
            await micToggle.click();
            console.log("[meeting] Turned off mic");
        }
    } catch {
        // Mic may already be off
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
 * Leaves the meeting and closes the browser.
 */
export async function leaveMeeting(): Promise<void> {
    if (page) {
        try {
            const hangUpBtn = page.locator(
                '[data-tid="hangup-button"], button[aria-label*="hang up" i], button[aria-label*="leave" i]'
            );
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
