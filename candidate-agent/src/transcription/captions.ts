import { Page } from "playwright";
import { EventEmitter } from "events";

export interface CaptionSegment {
    speaker: string;
    text: string;
}

export interface CaptionEvents {
    on(event: "caption", listener: (segment: CaptionSegment) => void): this;
    on(event: "utterance-end", listener: (speaker: string, text: string) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
}

/**
 * Enables Teams live captions and scrapes them from the DOM.
 * Emits "utterance-end" when a speaker's caption block stops updating.
 */
export async function startCaptionScraping(
    page: Page,
    candidateName: string,
    verbose: boolean,
): Promise<{
    emitter: EventEmitter & CaptionEvents;
    stop: () => void;
    reset: () => Promise<void>;
}> {
    const emitter = new EventEmitter() as EventEmitter & CaptionEvents;

    // Enable live captions via the "More" menu
    await enableCaptions(page);

    let lastSpeaker = "";
    let lastText = "";
    let ignoredText = ""; // Text to ignore (snapshot from after agent speaks)
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    const UTTERANCE_END_MS = 2000;
    let stopped = false;

    // Poll the captions container for new text
    const pollInterval = setInterval(async () => {
        if (stopped) return;

        try {
            const caption = await readCaption(page);
            if (!caption || !caption.text) return;

            // Skip the candidate's own speech (when Teams exposes speaker names)
            if (caption.speaker !== "Unknown") {
                const speakerLower = caption.speaker.toLowerCase();
                const nameLower = candidateName.toLowerCase();
                if (speakerLower.includes(nameLower) || nameLower.includes(speakerLower)) {
                    return;
                }
            }

            // Skip text that matches the post-speaking snapshot
            if (ignoredText && caption.text === ignoredText) return;
            // Once we see new text, clear the ignore marker
            if (ignoredText && caption.text !== ignoredText) {
                ignoredText = "";
            }

            const textChanged = caption.text !== lastText;
            const speakerChanged = caption.speaker !== lastSpeaker;

            if (speakerChanged && lastSpeaker && lastText) {
                if (silenceTimer) {
                    clearTimeout(silenceTimer);
                    silenceTimer = null;
                }
                emitter.emit("utterance-end", lastSpeaker, lastText);
            }

            if (textChanged || speakerChanged) {
                lastSpeaker = caption.speaker;
                lastText = caption.text;

                emitter.emit("caption", { speaker: caption.speaker, text: caption.text });

                if (silenceTimer) clearTimeout(silenceTimer);
                silenceTimer = setTimeout(() => {
                    if (lastText && lastSpeaker) {
                        if (verbose) {
                            console.log(`[captions] "${lastText}"`);
                        }
                        emitter.emit("utterance-end", lastSpeaker, lastText);
                        lastSpeaker = "";
                        lastText = "";
                    }
                }, UTTERANCE_END_MS);
            }
        } catch {
            // Page might have navigated or closed — ignore transient errors
        }
    }, 500);

    function stop() {
        stopped = true;
        clearInterval(pollInterval);
        if (silenceTimer) clearTimeout(silenceTimer);
    }

    /**
     * Reset caption tracking. Snapshots whatever's currently in the DOM
     * so the agent's own speech gets ignored when resuming listening.
     */
    async function reset() {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        lastSpeaker = "";
        lastText = "";

        // Snapshot current caption text so we skip it
        try {
            const current = await readCaption(page);
            ignoredText = current?.text || "";
        } catch {
            ignoredText = "";
        }
    }

    return { emitter, stop, reset };
}

/**
 * Reads the current caption text + speaker from the Teams DOM.
 */
async function readCaption(page: Page): Promise<{ speaker: string; text: string } | null> {
    return page.evaluate(() => {
        // Primary selector for Teams caption text
        const captionElements = document.querySelectorAll('[data-tid="closed-caption-text"]');
        if (captionElements.length > 0) {
            const lastCaption = captionElements[captionElements.length - 1];
            const text = lastCaption.textContent?.trim() || "";
            const container = lastCaption.closest('[data-tid="closed-caption-container"]') || lastCaption.parentElement;
            const speakerEl = container?.querySelector('[data-tid="closed-caption-speaker-name"]');
            const speaker = speakerEl?.textContent?.trim() || "Unknown";
            return { speaker, text };
        }

        // Fallback selectors for different Teams versions
        const altCaptions = document.querySelectorAll('.ui-chat__message, [class*="caption" i], [class*="subtitle" i]');
        for (const el of altCaptions) {
            const text = el.textContent?.trim();
            if (text && text.length > 0) {
                const parent = el.closest('[class*="caption" i]') || el.parentElement;
                const speakerEl = parent?.querySelector('[class*="name" i], [class*="speaker" i]');
                return {
                    speaker: speakerEl?.textContent?.trim() || "Unknown",
                    text,
                };
            }
        }

        return null;
    });
}

/**
 * Enables live captions in Teams by clicking through the UI.
 */
async function enableCaptions(page: Page): Promise<void> {
    console.log("[captions] Enabling live captions...");

    try {
        const moreBtn = page.locator(
            'button[data-tid="more-button"], button[aria-label*="More" i], button[id*="more" i]'
        );
        await moreBtn.waitFor({ timeout: 15000 });
        await moreBtn.click();

        await page.waitForTimeout(1000);

        const captionsItem = page.locator(
            'button:has-text("Turn on live captions"), button:has-text("captions"), [role="menuitem"]:has-text("caption")'
        );

        if (await captionsItem.isVisible({ timeout: 3000 })) {
            await captionsItem.click();
            console.log("[captions] Live captions enabled");
        } else {
            const langItem = page.locator(
                '[role="menuitem"]:has-text("Language"), [role="menuitem"]:has-text("speech")'
            );
            if (await langItem.isVisible({ timeout: 2000 })) {
                await langItem.click();
                await page.waitForTimeout(500);
                const captionsToggle = page.locator(
                    'button:has-text("captions"), [role="menuitem"]:has-text("captions"), [role="menuitemcheckbox"]:has-text("captions")'
                );
                await captionsToggle.click();
                console.log("[captions] Live captions enabled");
            } else {
                console.warn("[captions] Could not find captions option — enable manually: More (...) > Turn on live captions");
            }
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000);
    } catch (err) {
        console.error("[captions] Failed to enable captions automatically:", err);
        console.log("[captions] Please enable manually: More (...) > Turn on live captions");
    }
}
