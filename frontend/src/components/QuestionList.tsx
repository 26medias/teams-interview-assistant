import { useState } from "react";
import type { Question } from "../types.ts";

const CATEGORY_COLORS: Record<string, string> = {
    intro: "bg-gray-100 text-gray-700",
    technical: "bg-blue-100 text-blue-800",
    behavioral: "bg-green-100 text-green-800",
    situational: "bg-yellow-100 text-yellow-800",
    "deep-dive": "bg-purple-100 text-purple-800",
    "follow-up": "bg-orange-100 text-orange-800",
};

interface QuestionListProps {
    questions: Question[];
    onEdit: (id: string, text: string) => void;
    onDelete: (id: string) => void;
    onAiEdit: (id: string, feedback: string) => void;
}

export function QuestionList({ questions, onEdit, onDelete, onAiEdit }: QuestionListProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [aiEditId, setAiEditId] = useState<string | null>(null);
    const [aiFeedback, setAiFeedback] = useState("");

    const visibleQuestions = questions.filter((q) => !q.is_deleted);

    function startEdit(q: Question) {
        setEditingId(q.id);
        setEditText(q.text);
        setAiEditId(null);
    }

    function saveEdit(id: string) {
        onEdit(id, editText);
        setEditingId(null);
        setEditText("");
    }

    function startAiEdit(id: string) {
        setAiEditId(id);
        setAiFeedback("");
        setEditingId(null);
    }

    function submitAiEdit(id: string) {
        onAiEdit(id, aiFeedback);
        setAiEditId(null);
        setAiFeedback("");
    }

    if (visibleQuestions.length === 0) {
        return (
            <p className="py-4 text-center text-sm text-gray-400">
                No questions yet. Generate some below.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {visibleQuestions.map((q) => (
                <div
                    key={q.id}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                >
                    {editingId === q.id ? (
                        <div>
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={3}
                                className="mb-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => saveEdit(q.id)}
                                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setEditingId(null)}
                                    className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <p className="text-sm text-gray-800">{q.text}</p>
                                {q.category && (
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                            CATEGORY_COLORS[q.category] ?? "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        {q.category}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => startEdit(q)}
                                    className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => startAiEdit(q.id)}
                                    className="rounded-md px-2 py-1 text-xs text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                    AI Edit
                                </button>
                                <button
                                    onClick={() => onDelete(q.id)}
                                    className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                                >
                                    Delete
                                </button>
                            </div>

                            {aiEditId === q.id && (
                                <div className="mt-3 border-t border-gray-100 pt-3">
                                    <input
                                        type="text"
                                        value={aiFeedback}
                                        onChange={(e) => setAiFeedback(e.target.value)}
                                        placeholder="Describe how to change this question..."
                                        className="mb-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => submitAiEdit(q.id)}
                                            disabled={!aiFeedback.trim()}
                                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            Apply AI Edit
                                        </button>
                                        <button
                                            onClick={() => setAiEditId(null)}
                                            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
