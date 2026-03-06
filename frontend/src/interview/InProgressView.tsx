import { useState, useEffect, useCallback } from "react";
import { get, post } from "../api/client.ts";
import { TranscriptPanel } from "../components/TranscriptPanel.tsx";
import { SuggestionsPanel } from "../components/SuggestionsPanel.tsx";
import { CandidateSummary } from "../components/CandidateSummary.tsx";
import { CriteriaChecklist } from "../components/CriteriaChecklist.tsx";
import type { Interview, TranscriptSegment, Question } from "../types.ts";

const CATEGORY_COLORS: Record<string, string> = {
    technical: "bg-blue-100 text-blue-800",
    behavioral: "bg-green-100 text-green-800",
    situational: "bg-yellow-100 text-yellow-800",
    "deep-dive": "bg-purple-100 text-purple-800",
    intro: "bg-gray-100 text-gray-800",
};

const CATEGORY_ORDER = ["intro", "technical", "behavioral", "situational", "deep-dive"];

interface InProgressViewProps {
    interview: Interview;
    onStatusChange: () => void;
}

export function InProgressView({ interview, onStatusChange }: InProgressViewProps) {
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [ending, setEnding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [questionsOpen, setQuestionsOpen] = useState(false);
    const [questionsTab, setQuestionsTab] = useState("all");
    const [summaryOpen, setSummaryOpen] = useState(false);

    // Fetch all pre-generated questions once
    useEffect(() => {
        get<Question[]>(`/api/interviews/${interview.id}/questions`)
            .then(setQuestions)
            .catch(() => {});
    }, [interview.id]);

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

            {/* Candidate Summary — collapsible to save space during interview */}
            <div className="mb-4 rounded-lg bg-white shadow-sm">
                <button
                    onClick={() => setSummaryOpen(!summaryOpen)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                    <h4 className="text-sm font-semibold text-gray-900">Candidate Profile</h4>
                    <span className="text-sm text-gray-500">
                        {summaryOpen ? "Hide" : "Show"}
                    </span>
                </button>
                {summaryOpen && (
                    <div className="max-h-64 overflow-y-auto border-t border-gray-200">
                        <CandidateSummary interviewId={interview.id} />
                    </div>
                )}
            </div>

            {error && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Two-column layout */}
            <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
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

                {/* Right: Suggestions + Criteria (40%) */}
                <div className="flex w-2/5 flex-col gap-4">
                    <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-white shadow-sm">
                        <SuggestionsPanel interviewId={interview.id} />
                    </div>
                    <div className="flex h-56 shrink-0 flex-col rounded-lg bg-white shadow-sm">
                        <CriteriaChecklist interviewId={interview.id} />
                    </div>
                </div>
            </div>

            {/* All Generated Questions — collapsible */}
            <div className="mt-4 rounded-lg bg-white shadow-sm">
                <button
                    onClick={() => setQuestionsOpen(!questionsOpen)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                    <h4 className="text-sm font-semibold text-gray-900">
                        All Generated Questions ({questions.length})
                    </h4>
                    <span className="text-sm text-gray-500">
                        {questionsOpen ? "Hide" : "Show"}
                    </span>
                </button>
                {questionsOpen && (
                    <div className="border-t border-gray-200">
                        {/* Category tabs */}
                        <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-100">
                            <button
                                onClick={() => setQuestionsTab("all")}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                    questionsTab === "all"
                                        ? "bg-gray-900 text-white"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                All ({questions.filter((q) => !q.is_deleted).length})
                            </button>
                            {CATEGORY_ORDER.filter((cat) =>
                                questions.some((q) => q.category === cat && !q.is_deleted),
                            ).map((cat) => {
                                const count = questions.filter(
                                    (q) => q.category === cat && !q.is_deleted,
                                ).length;
                                const colorClass =
                                    CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-800";
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setQuestionsTab(cat)}
                                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                            questionsTab === cat
                                                ? colorClass + " ring-2 ring-offset-1 ring-gray-400"
                                                : colorClass + " opacity-70 hover:opacity-100"
                                        }`}
                                    >
                                        {cat} ({count})
                                    </button>
                                );
                            })}
                        </div>
                        <ul className="max-h-64 overflow-y-auto px-4 py-2">
                            {questions
                                .filter((q) => !q.is_deleted)
                                .filter((q) =>
                                    questionsTab === "all"
                                        ? true
                                        : q.category === questionsTab,
                                )
                                .map((q) => {
                                    const colorClass =
                                        CATEGORY_COLORS[q.category ?? ""] ??
                                        "bg-gray-100 text-gray-800";
                                    return (
                                        <li
                                            key={q.id}
                                            className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-b-0"
                                        >
                                            {q.category && questionsTab === "all" && (
                                                <span
                                                    className={`mt-0.5 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
                                                >
                                                    {q.category}
                                                </span>
                                            )}
                                            <span className="text-sm text-gray-800">
                                                {q.text}
                                            </span>
                                        </li>
                                    );
                                })}
                            {questions.filter((q) => !q.is_deleted).length === 0 && (
                                <li className="py-2 text-sm text-gray-400">
                                    No questions generated yet.
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
