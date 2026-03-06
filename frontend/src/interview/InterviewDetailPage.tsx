import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { get } from "../api/client.ts";
import type { Interview } from "../types.ts";
import { UpcomingView } from "./UpcomingView.tsx";
import { InProgressView } from "./InProgressView.tsx";
import { CompletedView } from "./CompletedView.tsx";

export function InterviewDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [interview, setInterview] = useState<Interview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchInterview = useCallback(() => {
        if (!id) return;
        get<Interview>(`/api/interviews/${id}`)
            .then(setInterview)
            .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        fetchInterview();
    }, [fetchInterview]);

    if (loading) {
        return <p className="py-12 text-center text-gray-400">Loading interview...</p>;
    }

    if (error || !interview) {
        return (
            <div className="py-12 text-center">
                <p className="mb-4 text-red-600">{error || "Interview not found"}</p>
                <button
                    onClick={() => navigate("/")}
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                    Back to dashboard
                </button>
            </div>
        );
    }

    switch (interview.status) {
        case "upcoming":
            return <UpcomingView interview={interview} onStatusChange={fetchInterview} />;
        case "in_progress":
            return <InProgressView interview={interview} onStatusChange={fetchInterview} />;
        case "completed":
            return <CompletedView interview={interview} />;
    }
}
