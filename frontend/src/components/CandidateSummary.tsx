import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { get } from "../api/client.ts";

interface SummaryResponse {
    summary: string;
}

interface CandidateSummaryProps {
    interviewId: string;
}

export function CandidateSummary({ interviewId }: CandidateSummaryProps) {
    const [summary, setSummary] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let cancelled = false;

        get<SummaryResponse>(`/api/interviews/${interviewId}/summary`)
            .then((data) => {
                if (!cancelled) setSummary(data.summary);
            })
            .catch((err) => {
                if (!cancelled && err instanceof Error && err.message.includes("(404)")) {
                    setNotFound(true);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [interviewId]);

    if (loading) {
        return (
            <div className="rounded-lg bg-gray-50 p-5">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading candidate profile...
                </div>
            </div>
        );
    }

    if (notFound || summary === null) {
        return (
            <div className="rounded-lg bg-gray-50 p-5">
                <p className="text-sm text-gray-400">No resume uploaded — candidate summary unavailable.</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg bg-gray-50 p-5">
            <div className="prose prose-sm prose-gray max-w-none prose-headings:text-base prose-headings:font-semibold prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900">
                <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
        </div>
    );
}
