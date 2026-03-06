export interface User {
    id: string;
    email: string;
    name: string;
}

export interface Interview {
    id: string;
    candidate_name: string;
    meeting_link: string | null;
    stage_details: string | null;
    status: "upcoming" | "in_progress" | "completed";
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
}

export interface Document {
    id: string;
    type: "resume" | "job_description" | "hiring_criteria";
    filename: string;
    created_at: string;
}

export interface Question {
    id: string;
    text: string;
    category: string | null;
    source: string;
    is_deleted: boolean;
    sort_order: number;
}

export interface TranscriptSegment {
    id: string;
    speaker: string;
    text: string;
    timestamp: string;
}

export interface Report {
    summary: string;
    pros: string[];
    cons: string[];
    rating: number;
    recommendation: string;
}
