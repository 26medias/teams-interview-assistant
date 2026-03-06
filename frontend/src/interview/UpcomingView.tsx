import { useState, useEffect, useCallback } from "react";
import { get, post, patch, del } from "../api/client.ts";
import { QuestionList } from "../components/QuestionList.tsx";
import type { Interview, Question } from "../types.ts";

interface UpcomingViewProps {
    interview: Interview;
    onStatusChange: () => void;
}

export function UpcomingView({ interview, onStatusChange }: UpcomingViewProps) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loadingQuestions, setLoadingQuestions] = useState(true);
    const [editingLink, setEditingLink] = useState(false);
    const [meetingLink, setMeetingLink] = useState(interview.meeting_link ?? "");
    const [generateFocus, setGenerateFocus] = useState("");
    const [showGenerateInput, setShowGenerateInput] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchQuestions = useCallback(() => {
        get<Question[]>(`/api/interviews/${interview.id}/questions`)
            .then(setQuestions)
            .catch(() => {})
            .finally(() => setLoadingQuestions(false));
    }, [interview.id]);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

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

    async function handleEditQuestion(id: string, text: string) {
        try {
            await patch(`/api/questions/${id}`, { text });
            fetchQuestions();
        } catch {
            // Silently fail; UI stays in edit mode
        }
    }

    async function handleDeleteQuestion(id: string) {
        try {
            await del(`/api/questions/${id}`);
            fetchQuestions();
        } catch {
            // Best effort
        }
    }

    async function handleAiEdit(id: string, feedback: string) {
        try {
            await patch(`/api/questions/${id}`, { feedback });
            fetchQuestions();
        } catch {
            // Best effort
        }
    }

    async function handleGenerate() {
        setGenerating(true);
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
        }
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Candidate summary */}
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
                            <button
                                onClick={handleUpdateLink}
                                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => setEditingLink(false)}
                                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="flex-1 truncate text-sm text-gray-500">
                                {interview.meeting_link || "No meeting link set"}
                            </p>
                            <button
                                onClick={() => setEditingLink(true)}
                                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                            >
                                Update Link
                            </button>
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

            {/* Questions */}
            <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">Questions</h3>
                    <button
                        onClick={() => setShowGenerateInput(!showGenerateInput)}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Generate More Questions
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
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {generating ? "Generating..." : "Generate"}
                        </button>
                    </div>
                )}

                {loadingQuestions ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                        Loading questions...
                    </p>
                ) : (
                    <QuestionList
                        questions={questions}
                        onEdit={handleEditQuestion}
                        onDelete={handleDeleteQuestion}
                        onAiEdit={handleAiEdit}
                    />
                )}
            </div>
        </div>
    );
}
