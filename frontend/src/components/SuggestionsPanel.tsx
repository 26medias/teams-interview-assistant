import { useState, useEffect, useCallback } from "react";
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
}

export function SuggestionsPanel({ interviewId }: SuggestionsPanelProps) {
    const [prepared, setPrepared] = useState<PreparedQuestion[]>([]);
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [loading, setLoading] = useState(false);

    // Connect to SSE for real-time suggestions
    useEffect(() => {
        const close = sse(
            `/api/interviews/${interviewId}/suggestions`,
            (data: string) => {
                try {
                    const parsed = JSON.parse(data) as SuggestionsData;
                    if (parsed.prepared) setPrepared(parsed.prepared);
                    if (parsed.followUps) setFollowUps(parsed.followUps);
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

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Suggested Questions</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Section 1: Prepared questions */}
                <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        Questions to Ask
                    </h4>
                    {prepared.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            Preparing questions...
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {prepared.map((q) => (
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

                {/* Section 2: Follow-up questions */}
                {followUps.length > 0 && (
                    <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                            Follow-up on What Was Just Said
                        </h4>
                        <ul className="space-y-2">
                            {followUps.map((q) => (
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
