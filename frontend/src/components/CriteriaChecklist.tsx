import { useState, useEffect } from "react";
import { get } from "../api/client.ts";
import type { CriteriaItem } from "../types.ts";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    todo: { label: "To Do", bg: "bg-gray-100", text: "text-gray-600" },
    in_progress: { label: "In Progress", bg: "bg-amber-100", text: "text-amber-700" },
    pass: { label: "Pass", bg: "bg-green-100", text: "text-green-700" },
    fail: { label: "Needs Work", bg: "bg-red-100", text: "text-red-700" },
};

interface CriteriaChecklistProps {
    interviewId: string;
    selectedCriterion?: string | null;
    onSelectCriterion?: (text: string | null) => void;
}

export function CriteriaChecklist({ interviewId, selectedCriterion, onSelectCriterion }: CriteriaChecklistProps) {
    const [criteria, setCriteria] = useState<CriteriaItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        function fetchCriteria() {
            get<CriteriaItem[]>(`/api/interviews/${interviewId}/criteria`)
                .then((items) => {
                    if (!cancelled) setCriteria(items);
                })
                .catch(() => {})
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }

        fetchCriteria();
        const interval = setInterval(fetchCriteria, 10_000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [interviewId]);

    if (loading) {
        return (
            <div className="p-4 text-sm text-gray-400">Loading criteria...</div>
        );
    }

    if (criteria.length === 0) {
        return (
            <div className="p-4 text-sm text-gray-400">No hiring criteria uploaded.</div>
        );
    }

    const counts = {
        pass: criteria.filter((c) => c.status === "pass").length,
        fail: criteria.filter((c) => c.status === "fail").length,
        in_progress: criteria.filter((c) => c.status === "in_progress").length,
        todo: criteria.filter((c) => c.status === "todo").length,
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Hiring Criteria Coverage</h3>
                <div className="mt-1 flex gap-2 text-xs">
                    {counts.pass > 0 && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                            {counts.pass} pass
                        </span>
                    )}
                    {counts.in_progress > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                            {counts.in_progress} in progress
                        </span>
                    )}
                    {counts.fail > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                            {counts.fail} needs work
                        </span>
                    )}
                    {counts.todo > 0 && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                            {counts.todo} todo
                        </span>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
                <ul className="space-y-2">
                    {criteria.map((item) => {
                        const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.todo;
                        const isSelected = selectedCriterion === item.text;
                        return (
                            <li
                                key={item.id}
                                onClick={() => onSelectCriterion?.(isSelected ? null : item.text)}
                                className={`cursor-pointer rounded-md border p-2.5 transition-colors ${
                                    isSelected
                                        ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm text-gray-800">{item.text}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                        {cfg.label}
                                    </span>
                                </div>
                                {item.evidence && (
                                    <p className="mt-1 text-xs text-gray-500">{item.evidence}</p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
