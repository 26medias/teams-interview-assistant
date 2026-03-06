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

interface TrackedEntry {
    id: string;
    speaker: string;
    text: string;
    lastChanged: number;
    emitted: boolean;
}

/**
 * Enables Teams live captions and scrapes them from the DOM.
 *
 * Teams renders captions as a list of fui-ChatMessageCompact entries.
 * Each entry has a unique avatar ID, a speaker name (data-tid="author"),
 * and caption text (data-tid="closed-caption-text") that updates live
 * as the person speaks. New entries appear when the speaker pauses or changes.
 *
 * We track each entry by its avatar ID, filter out the candidate's own speech,
 * and emit "utterance-end" when an entry's text stops changing.
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

    await enableCaptions(page);

    // Track each caption entry by its avatar ID
    const entries = new Map<string, TrackedEntry>();
    const FINALIZE_MS = 2500;
    let stopped = false;

    function isSelf(speaker: string): boolean {
        if (speaker === "Unknown") return false;
        const speakerLower = speaker.toLowerCase();
        const nameLower = candidateName.toLowerCase();
        return speakerLower.includes(nameLower) || nameLower.includes(speakerLower);
    }

    function emitEntry(entry: TrackedEntry) {
        if (entry.emitted || !entry.text.trim()) return;
        entry.emitted = true;
        // Skip the candidate's own speech
        if (isSelf(entry.speaker)) return;
        if (verbose) {
            console.log(`[captions] [${entry.speaker}] "${entry.text}"`);
        }
        emitter.emit("utterance-end", entry.speaker, entry.text);
    }

    // Check for finalized entries periodically
    const finalizeInterval = setInterval(() => {
        if (stopped) return;
        const now = Date.now();
        for (const entry of entries.values()) {
            if (!entry.emitted && now - entry.lastChanged > FINALIZE_MS) {
                emitEntry(entry);
            }
        }
    }, 500);

    // Poll the captions DOM
    const pollInterval = setInterval(async () => {
        if (stopped) return;

        try {
            const currentEntries = await readAllCaptions(page);
            if (!currentEntries || currentEntries.length === 0) return;

            const currentIds = new Set<string>();

            for (const raw of currentEntries) {
                currentIds.add(raw.id);

                const existing = entries.get(raw.id);
                if (existing) {
                    // Entry exists — check if text changed
                    if (raw.text !== existing.text) {
                        existing.text = raw.text;
                        existing.speaker = raw.speaker;
                        existing.lastChanged = Date.now();
                        if (existing.emitted) {
                            existing.emitted = false; // Re-arm: text grew
                        }
                    }
                } else {
                    // New entry appeared — finalize all previous un-emitted entries
                    for (const prev of entries.values()) {
                        if (!prev.emitted) {
                            emitEntry(prev);
                        }
                    }

                    entries.set(raw.id, {
                        id: raw.id,
                        speaker: raw.speaker,
                        text: raw.text,
                        lastChanged: Date.now(),
                        emitted: false,
                    });
                }

                // Emit live caption updates (for non-self speakers)
                if (!isSelf(raw.speaker)) {
                    emitter.emit("caption", { speaker: raw.speaker, text: raw.text });
                }
            }

            // Clean up entries that are no longer in the DOM (scrolled out)
            for (const [id, entry] of entries) {
                if (!currentIds.has(id)) {
                    if (!entry.emitted) {
                        emitEntry(entry);
                    }
                    entries.delete(id);
                }
            }
        } catch {
            // Page might have navigated or closed
        }
    }, 500);

    function stop() {
        stopped = true;
        clearInterval(pollInterval);
        clearInterval(finalizeInterval);
        for (const entry of entries.values()) {
            if (!entry.emitted) emitEntry(entry);
        }
    }

    /**
     * Reset caption tracking. Marks all current entries as emitted so the
     * agent's own speech (and any residual captions) are ignored when
     * resuming listening.
     */
    async function reset() {
        // Mark all tracked entries as emitted
        for (const entry of entries.values()) {
            entry.emitted = true;
        }

        // Also snapshot current DOM entries and mark them as emitted,
        // in case new entries appeared since the last poll
        try {
            const currentEntries = await readAllCaptions(page);
            for (const raw of currentEntries) {
                if (!entries.has(raw.id)) {
                    entries.set(raw.id, {
                        id: raw.id,
                        speaker: raw.speaker,
                        text: raw.text,
                        lastChanged: Date.now(),
                        emitted: true,
                    });
                }
            }
        } catch {
            // Best effort
        }
    }

    return { emitter, stop, reset };
}

/**
 * Reads ALL current caption entries from the Teams DOM.
 * Each entry has a unique ID (from the avatar), speaker name, and text.
 */
async function readAllCaptions(page: Page): Promise<Array<{ id: string; speaker: string; text: string }>> {
    return page.evaluate(() => {
        const results: Array<{ id: string; speaker: string; text: string }> = [];

        // Each caption entry is a fui-ChatMessageCompact
        const entries = document.querySelectorAll('.fui-ChatMessageCompact');
        for (const entry of entries) {
            const text = entry.querySelector('[data-tid="closed-caption-text"]')?.textContent?.trim();
            if (!text) continue;

            const speaker = entry.querySelector('[data-tid="author"]')?.textContent?.trim() || "Unknown";

            // Use the avatar ID as a unique identifier for this entry
            const avatarEl = entry.querySelector('.fui-Avatar');
            const id = avatarEl?.id || `entry-${results.length}`;

            results.push({ id, speaker, text });
        }

        return results;
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
                console.warn(
                    "[captions] Could not find captions option — enable manually: More (...) > Turn on live captions"
                );
            }
        }

        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000);
    } catch (err) {
        console.error("[captions] Failed to enable captions automatically:", err);
        console.log("[captions] Please enable manually: More (...) > Turn on live captions");
    }
}
