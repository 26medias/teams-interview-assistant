import { useState, useEffect, useCallback, useRef } from "react";
import { sse, post } from "../api/client.ts";

interface PreparedQuestion {
    id: string;
    text: string;
    category?: string;
}

interface FollowUp {
    id: string;
    text: string;
}

interface SuggestionsData {
    prepared: PreparedQuestion[];
    followUps: FollowUp[];
}

interface SuggestionsPanelProps {
    interviewId: string;
    criteriaFilter?: string | null;
}

const STOP_WORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "have", "has",
    "been", "being", "are", "was", "were", "will", "would", "could",
    "should", "can", "may", "might", "shall", "into", "than", "then",
    "also", "just", "about", "over", "under", "after", "before", "between",
    "through", "during", "without", "within", "along", "across", "behind",
    "beyond", "above", "below", "around", "among", "upon", "unto",
    "ability", "proven", "strong", "experience", "knowledge", "understanding",
    "proficiency", "expertise", "skills", "capable", "demonstrate",
]);

/**
 * Extract meaningful keywords from text for matching.
 * Keeps short technical terms (RAG, LLM, AI, ML, etc.) and filters stop words.
 */
function extractKeywords(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[\s,.\-/()]+/)
        .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Check if two follow-up texts are similar enough to be considered duplicates.
 */
function isSimilar(a: string, b: string): boolean {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
    if (wordsA.size === 0 || wordsB.size === 0) return false;
    let overlap = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) overlap++;
    }
    const smaller = Math.min(wordsA.size, wordsB.size);
    return overlap / smaller > 0.6;
}

/**
 * Check if a question text is relevant to a given criterion.
 * Uses keyword extraction with stop-word filtering, and substring matching
 * for multi-word phrases. Much more lenient than simple word overlap.
 */
function matchesCriterion(questionText: string, criterion: string): boolean {
    const qLower = questionText.toLowerCase();
    const criterionKeywords = extractKeywords(criterion);
    if (criterionKeywords.length === 0) return false;

    // Check substring matches (catches "RAG", "LLM", "prompt", etc.)
    const matched = criterionKeywords.filter((kw) => qLower.includes(kw)).length;

    // Also check 2-word phrases from the criterion for compound terms
    const criterionWords = criterion.toLowerCase().split(/\s+/);
    let phraseMatch = false;
    for (let i = 0; i < criterionWords.length - 1; i++) {
        const phrase = criterionWords[i] + " " + criterionWords[i + 1];
        if (phrase.length > 5 && qLower.includes(phrase)) {
            phraseMatch = true;
            break;
        }
    }

    if (phraseMatch) return true;
    // Require at least 1 keyword match if few keywords, or 20% for many
    const threshold = criterionKeywords.length <= 3 ? 1 : Math.ceil(criterionKeywords.length * 0.2);
    return matched >= threshold;
}

export function SuggestionsPanel({ interviewId, criteriaFilter }: SuggestionsPanelProps) {
    const [prepared, setPrepared] = useState<PreparedQuestion[]>([]);
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const followUpsRef = useRef<FollowUp[]>([]);
    // Accumulate all unique prepared questions seen via SSE for criterion filtering
    const allPreparedRef = useRef<Map<string, PreparedQuestion>>(new Map());
    const [allPrepared, setAllPrepared] = useState<PreparedQuestion[]>([]);
    const [loading, setLoading] = useState(false);

    // Connect to SSE for real-time suggestions
    useEffect(() => {
        const close = sse(
            `/api/interviews/${interviewId}/suggestions`,
            (data: string) => {
                try {
                    const parsed = JSON.parse(data) as SuggestionsData;
                    if (parsed.prepared) {
                        setPrepared(parsed.prepared);
                        // Accumulate into the full set (dedup by id)
                        for (const q of parsed.prepared) {
                            allPreparedRef.current.set(q.id, q);
                        }
                        setAllPrepared(Array.from(allPreparedRef.current.values()));
                    }
                    if (parsed.followUps && parsed.followUps.length > 0) {
                        // Accumulate follow-ups, dedup by similarity, keep latest 10
                        const existing = followUpsRef.current;
                        const merged = [...existing];
                        for (const newQ of parsed.followUps) {
                            const isDupe = merged.some((e) => isSimilar(e.text, newQ.text));
                            if (!isDupe) {
                                merged.push(newQ);
                            }
                        }
                        const trimmed = merged.slice(-10);
                        followUpsRef.current = trimmed;
                        setFollowUps(trimmed);
                    }
                } catch {
                    // Ignore unparseable messages
                }
            },
        );

        return close;
    }, [interviewId]);

    const requestMore = useCallback(async () => {
        setLoading(true);
        try {
            await post(`/api/interviews/${interviewId}/suggestions/more`);
        } catch {
            // Best-effort; new suggestions will arrive via SSE
        } finally {
            setLoading(false);
        }
    }, [interviewId]);

    // When filtering by criterion, search the FULL accumulated set (stable);
    // when not filtering, show the latest RAG-ranked 5.
    const displayPrepared = criteriaFilter
        ? allPrepared.filter((q) => matchesCriterion(q.text, criteriaFilter))
        : prepared;
    const displayFollowUps = criteriaFilter
        ? followUps.filter((q) => matchesCriterion(q.text, criteriaFilter))
        : followUps;

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Suggested Questions</h3>
                    {criteriaFilter && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 truncate max-w-[60%]">
                            {criteriaFilter}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Section 1: Follow-up questions (shown FIRST for immediate visibility) */}
                {displayFollowUps.length > 0 && (
                    <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                            Follow-up on What Was Just Said
                        </h4>
                        <ul className="space-y-2">
                            {displayFollowUps.slice().reverse().map((q) => (
                                <li
                                    key={q.id}
                                    className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-gray-800"
                                >
                                    {q.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Section 2: Prepared questions */}
                <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        Questions to Ask
                    </h4>
                    {displayPrepared.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            {criteriaFilter ? "No matching questions for this criterion." : "Preparing questions..."}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {displayPrepared.map((q) => (
                                <li
                                    key={q.id}
                                    className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-gray-800"
                                >
                                    {q.category && (
                                        <span className="mr-2 inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                                            {q.category}
                                        </span>
                                    )}
                                    {q.text}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="border-t border-gray-200 px-4 py-3">
                <button
                    onClick={requestMore}
                    disabled={loading}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {loading ? "Loading..." : "More Suggestions"}
                </button>
            </div>
        </div>
    );
}
