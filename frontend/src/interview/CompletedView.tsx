import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { get, post } from "../api/client.ts";
import { TranscriptPanel } from "../components/TranscriptPanel.tsx";
import type { Interview, Document, TranscriptSegment, Report } from "../types.ts";

interface CompletedViewProps {
    interview: Interview;
}

export function CompletedView({ interview }: CompletedViewProps) {
    const navigate = useNavigate();
    const [report, setReport] = useState<Report | null>(null);
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [showTranscript, setShowTranscript] = useState(false);
    const [loading, setLoading] = useState(true);

    // New interview form state
    const [showNewForm, setShowNewForm] = useState(false);
    const [newMeetingLink, setNewMeetingLink] = useState("");
    const [newStageDetails, setNewStageDetails] = useState("");
    const [pastStageDetails, setPastStageDetails] = useState<string[]>([]);
    const [creatingNew, setCreatingNew] = useState(false);
    const [newError, setNewError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        function fetchReport() {
            get<Report & { status?: string }>(`/api/interviews/${interview.id}/report`)
                .then((r) => {
                    if (cancelled) return;
                    if (r.status === "generating") {
                        // Report still generating — poll again in 5s
                        pollTimer = setTimeout(fetchReport, 5000);
                    } else {
                        setReport(r);
                    }
                })
                .catch(() => {});
        }

        // Fetch transcript once, start report polling
        get<TranscriptSegment[]>(`/api/interviews/${interview.id}/transcript`)
            .then((s) => { if (!cancelled) setSegments(s); })
            .catch(() => {});

        fetchReport();
        setLoading(false);

        return () => {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [interview.id]);

    useEffect(() => {
        if (showNewForm) {
            get<string[]>("/api/interviews/meta/stage-details")
                .then(setPastStageDetails)
                .catch(() => {});
        }
    }, [showNewForm]);

    async function handleCreateNew() {
        setCreatingNew(true);
        setNewError(null);
        try {
            // 1. Create interview with same candidate name
            const newInterview = await post<Interview>("/api/interviews", {
                candidate_name: interview.candidate_name,
                meeting_link: newMeetingLink || null,
                stage_details: newStageDetails || null,
            });

            // 2. Fetch documents from the current interview and attach them
            const docs = await get<Document[]>(`/api/interviews/${interview.id}/documents`);
            await Promise.all(
                docs.map((doc) =>
                    post(`/api/interviews/${newInterview.id}/documents/attach`, {
                        document_id: doc.id,
                    }),
                ),
            );

            // 3. Navigate to the new interview
            navigate(`/interviews/${newInterview.id}`);
        } catch (err) {
            setNewError(err instanceof Error ? err.message : "Failed to create interview");
        } finally {
            setCreatingNew(false);
        }
    }

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
                        onClick={() => setShowNewForm(!showNewForm)}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        New Interview
                    </button>
                    <button
                        onClick={handleExport}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Export to Markdown
                    </button>
                </div>
            </div>

            {showNewForm && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-5">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">
                        New interview with {interview.candidate_name}
                    </h4>
                    {newError && (
                        <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{newError}</div>
                    )}
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                Teams Meeting Link
                            </label>
                            <input
                                type="text"
                                value={newMeetingLink}
                                onChange={(e) => setNewMeetingLink(e.target.value)}
                                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                placeholder="https://teams.microsoft.com/l/meetup-join/..."
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                Stage Details
                            </label>
                            {pastStageDetails.length > 0 && (
                                <select
                                    value=""
                                    onChange={(e) => {
                                        if (e.target.value) setNewStageDetails(e.target.value);
                                    }}
                                    className="mb-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                >
                                    <option value="">Select from past interviews...</option>
                                    {pastStageDetails.map((detail) => (
                                        <option key={detail} value={detail}>
                                            {detail}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <input
                                type="text"
                                value={newStageDetails}
                                onChange={(e) => setNewStageDetails(e.target.value)}
                                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                placeholder="e.g. Technical deep dive round 2"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleCreateNew}
                                disabled={creatingNew}
                                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {creatingNew ? "Creating..." : "Create"}
                            </button>
                            <button
                                onClick={() => setShowNewForm(false)}
                                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                <div className="rounded-lg bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-center gap-3 py-4">
                        <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm font-medium text-indigo-700">Generating evaluation report...</p>
                    </div>
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
