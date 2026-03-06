import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { db } from "../db/postgres.js";
import { getInterviewDocuments } from "./document.js";

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * Generates a post-interview evaluation report.
 * Called when the interview status is set to "completed".
 */
export async function generateReport(interviewId: string): Promise<void> {
    const interview = (await db.query("SELECT * FROM interviews WHERE id = $1", [interviewId])).rows[0];
    if (!interview) throw new Error("Interview not found");

    // Get full transcript
    const transcript = await db.query(
        "SELECT speaker, text, timestamp FROM transcript_segments WHERE interview_id = $1 ORDER BY timestamp",
        [interviewId],
    );
    const transcriptText = transcript.rows
        .map((r: any) => `[${r.speaker}] ${r.text}`)
        .join("\n");

    if (!transcriptText) {
        console.log("[report] No transcript — skipping report generation");
        return;
    }

    // Get documents
    const docs = await getInterviewDocuments(interviewId);
    const resume = docs.find((d: any) => d.type === "resume")?.extracted_text || "";
    const jobDesc = docs.find((d: any) => d.type === "job_description")?.extracted_text || "";
    const criteria = docs.find((d: any) => d.type === "hiring_criteria")?.extracted_text || "";

    const prompt = `You are an expert interview evaluator. Analyze this interview and produce a structured evaluation.

CANDIDATE: ${interview.candidate_name}
INTERVIEW STAGE: ${interview.stage_details || "Not specified"}

JOB DESCRIPTION:
${jobDesc || "(Not provided)"}

HIRING CRITERIA:
${criteria || "(Not provided)"}

CANDIDATE RESUME:
${resume ? resume.slice(0, 2000) : "(Not provided)"}

FULL INTERVIEW TRANSCRIPT:
${transcriptText}

Produce a structured evaluation in EXACTLY this JSON format:
{
    "summary": "2-3 paragraph summary of the interview — what was discussed, how the candidate performed overall",
    "pros": ["Strength 1", "Strength 2", ...],
    "cons": ["Concern 1", "Concern 2", ...],
    "rating": <1-5 integer>,
    "recommendation": "Clear recommendation: strong hire / hire / lean hire / lean no hire / no hire, with reasoning and suggested next steps"
}

Rating scale:
1 = Strong no hire — major red flags or clearly unqualified
2 = No hire — does not meet enough criteria
3 = Borderline — some strengths but significant gaps
4 = Hire — meets most criteria, minor concerns
5 = Strong hire — exceeds expectations across the board

IMPORTANT:
- Be specific — reference actual things the candidate said
- Evaluate against EACH hiring criterion explicitly in the pros/cons
- For each criterion, note whether it was covered or not
- Output ONLY valid JSON, nothing else`;

    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        config: { maxOutputTokens: 4096 },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const responseText = response.text ?? "";

    // Parse JSON from response (handle markdown code blocks)
    let parsed: any;
    try {
        const jsonStr = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
    } catch {
        console.error("[report] Failed to parse LLM response as JSON:", responseText.slice(0, 200));
        parsed = {
            summary: responseText,
            pros: [],
            cons: [],
            rating: 3,
            recommendation: "Report generation had formatting issues — please review the summary.",
        };
    }

    // Build markdown export
    const markdown = buildMarkdown(interview.candidate_name, parsed);

    // Upsert report
    await db.query(
        `INSERT INTO reports (interview_id, summary, pros, cons, rating, recommendation, raw_markdown)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (interview_id) DO UPDATE SET
            summary = $2, pros = $3, cons = $4, rating = $5, recommendation = $6, raw_markdown = $7`,
        [
            interviewId,
            parsed.summary,
            JSON.stringify(parsed.pros || []),
            JSON.stringify(parsed.cons || []),
            parsed.rating || 3,
            parsed.recommendation,
            markdown,
        ],
    );

    console.log(`[report] Generated report for interview ${interviewId}`);
}

export async function getReport(interviewId: string) {
    const result = await db.query("SELECT * FROM reports WHERE interview_id = $1", [interviewId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        summary: row.summary,
        pros: JSON.parse(row.pros || "[]"),
        cons: JSON.parse(row.cons || "[]"),
        rating: row.rating,
        recommendation: row.recommendation,
        raw_markdown: row.raw_markdown,
    };
}

function buildMarkdown(candidateName: string, report: any): string {
    const pros = (report.pros || []).map((p: string) => `- ${p}`).join("\n");
    const cons = (report.cons || []).map((c: string) => `- ${c}`).join("\n");

    return `# Interview Evaluation: ${candidateName}

## Summary

${report.summary}

## Strengths

${pros || "- None noted"}

## Concerns

${cons || "- None noted"}

## Rating: ${report.rating}/5

## Recommendation

${report.recommendation}
`;
}
