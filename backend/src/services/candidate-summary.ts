import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { db } from "../db/postgres.js";
import { getInterviewDocuments } from "./document.js";

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

// In-memory cache to avoid regenerating summaries
const summaryCache = new Map<string, string>();

/**
 * Generates a rich candidate profile summary from their resume and job context.
 * Returns markdown. Cached per interview ID.
 */
export async function getCandidateSummary(interviewId: string): Promise<string | null> {
    if (summaryCache.has(interviewId)) {
        return summaryCache.get(interviewId)!;
    }

    const interview = (await db.query("SELECT * FROM interviews WHERE id = $1", [interviewId])).rows[0];
    if (!interview) return null;

    const docs = await getInterviewDocuments(interviewId);
    const resume = docs.find((d: any) => d.type === "resume")?.extracted_text;
    if (!resume) return null;

    const jobDesc = docs.find((d: any) => d.type === "job_description")?.extracted_text || "";
    const criteria = docs.find((d: any) => d.type === "hiring_criteria")?.extracted_text || "";

    const prompt = `You are preparing a candidate briefing for an interviewer. Write a comprehensive profile summary in markdown so the interviewer can learn about this candidate in 2 minutes without reading the full resume.

CANDIDATE: ${interview.candidate_name}
INTERVIEW STAGE: ${interview.stage_details || "Not specified"}

RESUME:
${resume.slice(0, 4000)}

${jobDesc ? `JOB DESCRIPTION:\n${jobDesc.slice(0, 2000)}` : ""}

${criteria ? `HIRING CRITERIA:\n${criteria.slice(0, 1500)}` : ""}

Write the following sections in markdown format:

## Overview
One paragraph: who they are, current role, years of experience, career trajectory.

## Technical Stack
Bullet list of their key technologies, languages, frameworks, tools — grouped logically. Highlight anything directly relevant to the job.

## Relevant Experience
2-4 bullet points highlighting specific projects, achievements, or roles that are most relevant to THIS job and hiring criteria. Include concrete details (metrics, scale, outcomes) from the resume.

## Strengths to Explore
2-3 bullet points on areas where the candidate looks strong based on the resume — things the interviewer should dig into.

## Potential Gaps
2-3 bullet points on areas where the resume doesn't clearly demonstrate competency against the hiring criteria — things the interviewer should probe.

Be specific and reference actual content from the resume. Do not make up information.`;

    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        config: { maxOutputTokens: 4096 },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const summary = response.text?.trim() || null;
    if (summary) {
        summaryCache.set(interviewId, summary);
    }
    return summary;
}
