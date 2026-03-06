import { useNavigate } from "react-router-dom";
import type { Interview } from "../types.ts";

const STATUS_STYLES: Record<Interview["status"], string> = {
    upcoming: "bg-blue-100 text-blue-800",
    in_progress: "bg-amber-100 text-amber-800",
    completed: "bg-green-100 text-green-800",
};

const STATUS_LABELS: Record<Interview["status"], string> = {
    upcoming: "Upcoming",
    in_progress: "In Progress",
    completed: "Completed",
};

interface InterviewCardProps {
    interview: Interview;
}

export function InterviewCard({ interview }: InterviewCardProps) {
    const navigate = useNavigate();

    return (
        <div
            onClick={() => navigate(`/interviews/${interview.id}`)}
            className="cursor-pointer rounded-lg bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
            <div className="mb-3 flex items-start justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                    {interview.candidate_name}
                </h3>
                <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[interview.status]
                    }`}
                >
                    {STATUS_LABELS[interview.status]}
                </span>
            </div>

            {interview.stage_details && (
                <p className="mb-2 text-sm text-gray-500 line-clamp-2">
                    {interview.stage_details}
                </p>
            )}

            <p className="text-xs text-gray-400">
                Created {new Date(interview.created_at).toLocaleDateString()}
            </p>
        </div>
    );
}
