import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { db } from "../db/postgres.js";
import { getInterviewDocuments } from "./document.js";

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Debounce: only evaluate every 30s per interview
const lastEvalTime = new Map<string, number>();
const EVAL_INTERVAL_MS = 30_000;

export interface CriteriaItem {
    id: string;
    text: string;
    status: "todo" | "in_progress" | "pass" | "fail";
    evidence: string | null;
}

/**
 * Get criteria items for an interview. Initializes them from the hiring criteria
 * document if they don't exist yet.
 */
export async function getCriteria(interviewId: string): Promise<CriteriaItem[]> {
    const existing = await db.query(
        "SELECT id, text, status, evidence FROM criteria_items WHERE interview_id = $1 ORDER BY created_at",
        [interviewId],
    );

    if (existing.rows.length > 0) {
        return existing.rows;
    }

    // Initialize from hiring criteria document
    await initializeCriteria(interviewId);

    const fresh = await db.query(
        "SELECT id, text, status, evidence FROM criteria_items WHERE interview_id = $1 ORDER BY created_at",
        [interviewId],
    );
    return fresh.rows;
}

/**
 * Parse hiring criteria document into individual assessable items.
 */
async function initializeCriteria(interviewId: string): Promise<void> {
    const docs = await getInterviewDocuments(interviewId);
    const criteriaDoc = docs.find((d: any) => d.type === "hiring_criteria");
    if (!criteriaDoc?.extracted_text) return;

    const interview = (await db.query("SELECT * FROM interviews WHERE id = $1", [interviewId])).rows[0];
    if (!interview) return;

    const jobDesc = docs.find((d: any) => d.type === "job_description")?.extracted_text || "";

    const prompt = `Parse the following hiring criteria into individual, evaluable items. Each item should be a specific skill, competency, or requirement that an interviewer can assess during a conversation.

HIRING CRITERIA:
${criteriaDoc.extracted_text}

${jobDesc ? `JOB DESCRIPTION:\n${jobDesc.slice(0, 2000)}` : ""}

INTERVIEW STAGE: ${interview.stage_details || "Not specified"}

Output one criterion per line, no numbering, no bullets, no dashes. Each should be a concise, assessable statement.
Examples of good items:
- Strong experience with distributed systems
- Ability to lead and mentor a team
- Problem-solving under pressure
- Knowledge of cloud infrastructure (AWS/GCP)

Output 5-15 items. Focus on what matters most for this role and stage.`;

    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        config: { maxOutputTokens: 1024 },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = response.text ?? "";
    const items = text.split("\n")
        .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
        .filter((l) => l.length > 5 && l.length < 200);

    for (const item of items) {
        await db.query(
            "INSERT INTO criteria_items (interview_id, text) VALUES ($1, $2)",
            [interviewId, item],
        );
    }

    console.log(`[criteria] Initialized ${items.length} criteria for interview ${interviewId}`);
}

/**
 * Evaluate criteria against the current transcript. Debounced to avoid
 * hammering Gemini on every transcript segment.
 */
export async function evaluateCriteria(interviewId: string): Promise<void> {
    const now = Date.now();
    const last = lastEvalTime.get(interviewId) || 0;
    if (now - last < EVAL_INTERVAL_MS) return;
    lastEvalTime.set(interviewId, now);

    const criteria = await db.query(
        "SELECT id, text, status FROM criteria_items WHERE interview_id = $1 ORDER BY created_at",
        [interviewId],
    );
    if (criteria.rows.length === 0) return;

    const transcript = await db.query(
        "SELECT speaker, text FROM transcript_segments WHERE interview_id = $1 ORDER BY timestamp",
        [interviewId],
    );
    if (transcript.rows.length < 3) return;

    const transcriptText = transcript.rows
        .map((r: any) => `${r.speaker}: ${r.text}`)
        .join("\n");

    const criteriaList = criteria.rows
        .map((c: any, i: number) => `${i + 1}. ${c.text} [current: ${c.status}]`)
        .join("\n");

    const prompt = `You are evaluating a job interview in progress. Based on the transcript so far, update the status of each hiring criterion.

CRITERIA:
${criteriaList}

TRANSCRIPT:
${transcriptText.slice(-5000)}

For each criterion, output a line in this exact format:
NUMBER|STATUS|EVIDENCE

Where STATUS is one of: todo, in_progress, pass, fail
- todo: not discussed yet
- in_progress: being discussed or partially covered
- pass: candidate demonstrated clear competency
- fail: candidate showed weakness or could not answer

EVIDENCE should be a brief (1 sentence) note about what was said, or empty if todo.

Example:
1|pass|Candidate described building distributed systems at scale with concrete metrics
2|in_progress|Started discussing team leadership but hasn't given specific examples yet
3|todo|
4|fail|Could not explain basic cloud deployment patterns when asked

Output exactly ${criteria.rows.length} lines, one per criterion.`;

    try {
        const response = await client.models.generateContent({
            model: "gemini-2.5-flash",
            config: { maxOutputTokens: 1024 },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const lines = (response.text ?? "").split("\n").filter((l) => l.includes("|"));

        for (const line of lines) {
            const parts = line.split("|");
            if (parts.length < 2) continue;

            const idx = parseInt(parts[0].trim()) - 1;
            if (idx < 0 || idx >= criteria.rows.length) continue;

            const status = parts[1].trim().toLowerCase();
            if (!["todo", "in_progress", "pass", "fail"].includes(status)) continue;

            const evidence = parts.slice(2).join("|").trim() || null;
            const criterionId = criteria.rows[idx].id;

            await db.query(
                "UPDATE criteria_items SET status = $1, evidence = $2, updated_at = now() WHERE id = $3",
                [status, evidence, criterionId],
            );
        }

        console.log(`[criteria] Evaluated ${lines.length} criteria for interview ${interviewId}`);
    } catch (err) {
        console.error("[criteria] Evaluation failed:", err);
    }
}
