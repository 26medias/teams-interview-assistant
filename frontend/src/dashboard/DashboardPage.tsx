import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { get } from "../api/client.ts";
import type { Interview } from "../types.ts";
import { InterviewCard } from "./InterviewCard.tsx";

export function DashboardPage() {
    const navigate = useNavigate();
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        get<Interview[]>("/api/interviews")
            .then(setInterviews)
            .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div>
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Interviews</h2>
                <button
                    onClick={() => navigate("/interviews/new")}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    New Interview
                </button>
            </div>

            {loading && (
                <p className="py-12 text-center text-gray-400">Loading interviews...</p>
            )}

            {error && (
                <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
            )}

            {!loading && !error && interviews.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
                    <p className="mb-2 text-gray-500">No interviews yet</p>
                    <button
                        onClick={() => navigate("/interviews/new")}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                        Create your first interview
                    </button>
                </div>
            )}

            {!loading && interviews.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {interviews.map((interview) => (
                        <InterviewCard key={interview.id} interview={interview} />
                    ))}
                </div>
            )}
        </div>
    );
}
