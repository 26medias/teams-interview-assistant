import { useState, useEffect, useCallback } from "react";
import { get, post } from "../api/client.ts";
import { TranscriptPanel } from "../components/TranscriptPanel.tsx";
import { SuggestionsPanel } from "../components/SuggestionsPanel.tsx";
import type { Interview, TranscriptSegment } from "../types.ts";

interface InProgressViewProps {
    interview: Interview;
    onStatusChange: () => void;
}

export function InProgressView({ interview, onStatusChange }: InProgressViewProps) {
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [ending, setEnding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Poll transcript every 3 seconds
    const fetchTranscript = useCallback(() => {
        get<TranscriptSegment[]>(`/api/interviews/${interview.id}/transcript`)
            .then(setSegments)
            .catch(() => {});
    }, [interview.id]);

    useEffect(() => {
        fetchTranscript();
        const interval = setInterval(fetchTranscript, 3000);
        return () => clearInterval(interval);
    }, [fetchTranscript]);

    async function handleEnd() {
        setEnding(true);
        setError(null);
        try {
            await post(`/api/interviews/${interview.id}/leave`);
            onStatusChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to end interview");
        } finally {
            setEnding(false);
        }
    }

    return (
        <div className="flex h-[calc(100vh-10rem)] flex-col">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        {interview.candidate_name}
                    </h3>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        In Progress
                    </span>
                </div>
                <button
                    onClick={handleEnd}
                    disabled={ending}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                    {ending ? "Ending..." : "End Interview"}
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Two-column layout */}
            <div className="flex flex-1 gap-4 overflow-hidden">
                {/* Left: Transcript (60%) */}
                <div className="flex w-3/5 flex-col rounded-lg bg-white shadow-sm">
                    <div className="border-b border-gray-200 px-4 py-3">
                        <h4 className="text-sm font-semibold text-gray-900">
                            Live Transcript
                        </h4>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <TranscriptPanel segments={segments} />
                    </div>
                </div>

                {/* Right: Suggestions (40%) */}
                <div className="flex w-2/5 flex-col rounded-lg bg-white shadow-sm">
                    <SuggestionsPanel interviewId={interview.id} />
                </div>
            </div>
        </div>
    );
}
