import { useState, useEffect } from "react";
import { get } from "../api/client.ts";
import { TranscriptPanel } from "../components/TranscriptPanel.tsx";
import type { Interview, TranscriptSegment, Report } from "../types.ts";

interface CompletedViewProps {
    interview: Interview;
}

export function CompletedView({ interview }: CompletedViewProps) {
    const [report, setReport] = useState<Report | null>(null);
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [showTranscript, setShowTranscript] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            get<Report>(`/api/interviews/${interview.id}/report`).catch(() => null),
            get<TranscriptSegment[]>(`/api/interviews/${interview.id}/transcript`).catch(
                () => [],
            ),
        ])
            .then(([r, s]) => {
                setReport(r);
                setSegments(s);
            })
            .finally(() => setLoading(false));
    }, [interview.id]);

    async function handleExport() {
        try {
            const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
            const token = localStorage.getItem("auth_token");
            const res = await fetch(
                `${BASE_URL}/api/interviews/${interview.id}/report/markdown`,
                {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                },
            );
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${interview.candidate_name}-report.md`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // Best effort
        }
    }

    if (loading) {
        return <p className="py-12 text-center text-gray-400">Loading report...</p>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between rounded-lg bg-white p-5 shadow-sm">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                        {interview.candidate_name}
                    </h3>
                    {interview.stage_details && (
                        <p className="mt-1 text-sm text-gray-500">
                            {interview.stage_details}
                        </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                        Completed{" "}
                        {interview.completed_at
                            ? new Date(interview.completed_at).toLocaleString()
                            : ""}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Completed
                    </span>
                    <button
                        onClick={handleExport}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Export to Markdown
                    </button>
                </div>
            </div>

            {/* Report */}
            {report ? (
                <div className="space-y-5 rounded-lg bg-white p-5 shadow-sm">
                    {/* Rating */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-500">Rating:</span>
                        <span className="text-2xl font-bold text-indigo-600">
                            {report.rating}/5
                        </span>
                    </div>

                    {/* Summary */}
                    <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-900">Summary</h4>
                        <p className="text-sm text-gray-700">{report.summary}</p>
                    </div>

                    {/* Pros */}
                    <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-900">Pros</h4>
                        <ul className="list-disc space-y-1 pl-5">
                            {report.pros.map((pro, i) => (
                                <li key={i} className="text-sm text-gray-700">
                                    {pro}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Cons */}
                    <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-900">Cons</h4>
                        <ul className="list-disc space-y-1 pl-5">
                            {report.cons.map((con, i) => (
                                <li key={i} className="text-sm text-gray-700">
                                    {con}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Recommendation */}
                    <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-900">
                            Recommendation
                        </h4>
                        <p className="text-sm text-gray-700">{report.recommendation}</p>
                    </div>
                </div>
            ) : (
                <div className="rounded-lg bg-white p-5 text-center shadow-sm">
                    <p className="text-sm text-gray-400">Report not available yet.</p>
                </div>
            )}

            {/* Transcript (collapsible) */}
            <div className="rounded-lg bg-white shadow-sm">
                <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                    <h4 className="text-sm font-semibold text-gray-900">Full Transcript</h4>
                    <span className="text-sm text-gray-400">
                        {showTranscript ? "Hide" : "Show"}
                    </span>
                </button>
                {showTranscript && (
                    <div className="max-h-96 overflow-y-auto border-t border-gray-200">
                        <TranscriptPanel segments={segments} />
                    </div>
                )}
            </div>
        </div>
    );
}
