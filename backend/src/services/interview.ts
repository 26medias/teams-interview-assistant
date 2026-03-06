import { db } from "../db/postgres.js";

export async function createInterview(userId: string, candidateName: string, meetingLink?: string, stageDetails?: string) {
    const result = await db.query(
        `INSERT INTO interviews (user_id, candidate_name, meeting_link, stage_details)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, candidateName, meetingLink || null, stageDetails || null],
    );
    return result.rows[0];
}

export async function getInterviews(userId: string) {
    const result = await db.query(
        "SELECT * FROM interviews WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
    );
    return result.rows;
}

export async function getInterview(id: string, userId: string) {
    const result = await db.query(
        "SELECT * FROM interviews WHERE id = $1 AND user_id = $2",
        [id, userId],
    );
    return result.rows[0] || null;
}

export async function updateInterview(id: string, userId: string, updates: Record<string, unknown>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
        // Only allow specific fields to be updated
        if (["meeting_link", "stage_details", "candidate_name"].includes(key)) {
            fields.push(`${key} = $${idx}`);
            values.push(value);
            idx++;
        }
    }

    if (fields.length === 0) return null;

    values.push(id, userId);
    const result = await db.query(
        `UPDATE interviews SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
        values,
    );
    return result.rows[0] || null;
}

export async function setInterviewStatus(id: string, status: string) {
    const timestampField = status === "in_progress" ? "started_at" : status === "completed" ? "completed_at" : null;
    const extra = timestampField ? `, ${timestampField} = now()` : "";

    const result = await db.query(
        `UPDATE interviews SET status = $1${extra} WHERE id = $2 RETURNING *`,
        [status, id],
    );
    return result.rows[0] || null;
}
