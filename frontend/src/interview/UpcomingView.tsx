import { useState, useEffect, useCallback, useRef } from "react";
import { get, post, patch, del } from "../api/client.ts";
import { CandidateSummary } from "../components/CandidateSummary.tsx";
import type { Interview, Question } from "../types.ts";

const CATEGORY_ORDER = ["intro", "technical", "behavioral", "situational", "deep-dive"];
const CATEGORY_COLORS: Record<string, string> = {
    intro: "bg-gray-100 text-gray-700 border-gray-300",
    technical: "bg-blue-50 text-blue-700 border-blue-300",
    behavioral: "bg-green-50 text-green-700 border-green-300",
    situational: "bg-yellow-50 text-yellow-700 border-yellow-300",
    "deep-dive": "bg-purple-50 text-purple-700 border-purple-300",
};

interface UpcomingViewProps {
    interview: Interview;
    onStatusChange: () => void;
}

export function UpcomingView({ interview, onStatusChange }: UpcomingViewProps) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loadingQuestions, setLoadingQuestions] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingStatus, setGeneratingStatus] = useState("");
    const [activeTab, setActiveTab] = useState("all");

    const [editingLink, setEditingLink] = useState(false);
    const [meetingLink, setMeetingLink] = useState(interview.meeting_link ?? "");
    const [generateFocus, setGenerateFocus] = useState("");
    const [showGenerateInput, setShowGenerateInput] = useState(false);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [aiEditId, setAiEditId] = useState<string | null>(null);
    const [aiFeedback, setAiFeedback] = useState("");

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchQuestions = useCallback(() => {
        return get<Question[]>(`/api/interviews/${interview.id}/questions`)
            .then((qs) => {
                setQuestions(qs);
                setLoadingQuestions(false);
                return qs;
            })
            .catch(() => {
                setLoadingQuestions(false);
                return [] as Question[];
            });
    }, [interview.id]);

    // On mount: fetch questions. If none exist, trigger generation + poll.
    useEffect(() => {
        let cancelled = false;

        fetchQuestions().then((qs) => {
            if (cancelled) return;
            if (qs.length === 0) {
                // No questions yet — trigger generation
                setGenerating(true);
                setGeneratingStatus("Analyzing resume and generating questions...");
                post(`/api/interviews/${interview.id}/questions/generate`)
                    .then(() => {
                        if (!cancelled) {
                            fetchQuestions();
                            setGenerating(false);
                            setGeneratingStatus("");
                        }
                    })
                    .catch(() => {
                        if (!cancelled) {
                            setGenerating(false);
                            setGeneratingStatus("");
                        }
                    });

                // Poll every 3s to show questions as soon as they're ready
                pollRef.current = setInterval(async () => {
                    if (cancelled) return;
                    const fresh = await fetchQuestions();
                    if (fresh.length > 0 && pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                        setGenerating(false);
                        setGeneratingStatus("");
                    }
                }, 3000);
            }
        });

        return () => {
            cancelled = true;
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [interview.id, fetchQuestions]);

    async function handleJoin() {
        setJoining(true);
        setError(null);
        try {
            await post(`/api/interviews/${interview.id}/join`);
            onStatusChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to join meeting");
        } finally {
            setJoining(false);
        }
    }

    async function handleUpdateLink() {
        try {
            await patch(`/api/interviews/${interview.id}`, { meeting_link: meetingLink });
            setEditingLink(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update link");
        }
    }

    async function handleEditQuestion(id: string) {
        try {
            await patch(`/api/questions/${id}`, { text: editText });
            setEditingId(null);
            setEditText("");
            fetchQuestions();
        } catch { /* stays in edit mode */ }
    }

    async function handleDeleteQuestion(id: string) {
        try {
            await del(`/api/questions/${id}`);
            fetchQuestions();
        } catch { /* best effort */ }
    }

    async function handleAiEdit(id: string) {
        try {
            await patch(`/api/questions/${id}`, { feedback: aiFeedback });
            setAiEditId(null);
            setAiFeedback("");
            fetchQuestions();
        } catch { /* best effort */ }
    }

    async function handleGenerate() {
        setGenerating(true);
        setGeneratingStatus("Generating additional questions...");
        try {
            await post(`/api/interviews/${interview.id}/questions/generate`, {
                focus: generateFocus || undefined,
            });
            fetchQuestions();
            setShowGenerateInput(false);
            setGenerateFocus("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate questions");
        } finally {
            setGenerating(false);
            setGeneratingStatus("");
        }
    }

    // Group questions by category
    const grouped = new Map<string, Question[]>();
    for (const q of questions.filter((q) => !q.is_deleted)) {
        const cat = q.category || "general";
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(q);
    }
    const categories = [...grouped.keys()].sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a);
        const bi = CATEGORY_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const visibleQuestions = activeTab === "all"
        ? questions.filter((q) => !q.is_deleted)
        : (grouped.get(activeTab) || []);

    return (
        <div className="space-y-6">
            {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Header card */}
            <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {interview.candidate_name}
                        </h3>
                        {interview.stage_details && (
                            <p className="mt-1 text-sm text-gray-500">
                                {interview.stage_details}
                            </p>
                        )}
                    </div>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        Upcoming
                    </span>
                </div>

                <div className="mt-4 flex items-center gap-3">
                    {editingLink ? (
                        <>
                            <input
                                type="text"
                                value={meetingLink}
                                onChange={(e) => setMeetingLink(e.target.value)}
                                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            />
                            <button onClick={handleUpdateLink} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Save</button>
                            <button onClick={() => setEditingLink(false)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                        </>
                    ) : (
                        <>
                            <p className="flex-1 truncate text-sm text-gray-500">
                                {interview.meeting_link || "No meeting link set"}
                            </p>
                            <button onClick={() => setEditingLink(true)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Update Link</button>
                        </>
                    )}
                </div>

                <div className="mt-4">
                    <button
                        onClick={handleJoin}
                        disabled={joining || !interview.meeting_link}
                        className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {joining ? "Joining..." : "Join Meeting"}
                    </button>
                </div>
            </div>

            {/* Candidate Summary */}
            <CandidateSummary interviewId={interview.id} />

            {/* Questions */}
            <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">
                        Questions {!loadingQuestions && `(${questions.filter((q) => !q.is_deleted).length})`}
                    </h3>
                    <button
                        onClick={() => setShowGenerateInput(!showGenerateInput)}
                        disabled={generating}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Generate More
                    </button>
                </div>

                {showGenerateInput && (
                    <div className="mb-4 flex gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                        <input
                            type="text"
                            value={generateFocus}
                            onChange={(e) => setGenerateFocus(e.target.value)}
                            placeholder="Focus area (optional), e.g. 'system design experience'"
                            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        <button onClick={handleGenerate} disabled={generating} className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
                            {generating ? "Generating..." : "Generate"}
                        </button>
                    </div>
                )}

                {/* Generating indicator */}
                {generating && (
                    <div className="mb-4 flex items-center gap-3 rounded-md bg-indigo-50 p-4">
                        <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm font-medium text-indigo-700">{generatingStatus}</span>
                    </div>
                )}

                {/* Category tabs */}
                {!loadingQuestions && categories.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                        <button
                            onClick={() => setActiveTab("all")}
                            className={`rounded-md px-3 py-1 text-xs font-medium ${
                                activeTab === "all"
                                    ? "bg-gray-900 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            All ({questions.filter((q) => !q.is_deleted).length})
                        </button>
                        {categories.map((cat) => {
                            const color = CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-700 border-gray-300";
                            const count = grouped.get(cat)?.length || 0;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveTab(cat)}
                                    className={`rounded-md border px-3 py-1 text-xs font-medium ${
                                        activeTab === cat
                                            ? color + " ring-2 ring-offset-1 ring-gray-400"
                                            : color + " opacity-70 hover:opacity-100"
                                    }`}
                                >
                                    {cat} ({count})
                                </button>
                            );
                        })}
                    </div>
                )}

                {loadingQuestions ? (
                    <p className="py-4 text-center text-sm text-gray-400">Loading questions...</p>
                ) : visibleQuestions.length === 0 && !generating ? (
                    <p className="py-4 text-center text-sm text-gray-400">No questions in this category.</p>
                ) : (
                    <div className="space-y-3">
                        {visibleQuestions.map((q) => (
                            <div key={q.id} className="rounded-lg border border-gray-200 bg-white p-4">
                                {editingId === q.id ? (
                                    <div>
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            rows={3}
                                            className="mb-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditQuestion(q.id)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Save</button>
                                            <button onClick={() => setEditingId(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <p className="text-sm text-gray-800">{q.text}</p>
                                            {q.category && activeTab === "all" && (
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    (CATEGORY_COLORS[q.category] || "bg-gray-100 text-gray-700").split(" ").slice(0, 2).join(" ")
                                                }`}>
                                                    {q.category}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setEditingId(q.id); setEditText(q.text); setAiEditId(null); }} className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Edit</button>
                                            <button onClick={() => { setAiEditId(q.id); setAiFeedback(""); setEditingId(null); }} className="rounded-md px-2 py-1 text-xs text-indigo-500 hover:bg-indigo-50">AI Edit</button>
                                            <button onClick={() => handleDeleteQuestion(q.id)} className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50">Delete</button>
                                        </div>

                                        {aiEditId === q.id && (
                                            <div className="mt-3 border-t border-gray-100 pt-3">
                                                <input
                                                    type="text"
                                                    value={aiFeedback}
                                                    onChange={(e) => setAiFeedback(e.target.value)}
                                                    placeholder="Describe how to change this question..."
                                                    className="mb-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                    onKeyDown={(e) => { if (e.key === "Enter" && aiFeedback.trim()) handleAiEdit(q.id); }}
                                                />
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleAiEdit(q.id)} disabled={!aiFeedback.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">Apply AI Edit</button>
                                                    <button onClick={() => setAiEditId(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
