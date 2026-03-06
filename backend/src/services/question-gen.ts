import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { db } from "../db/postgres.js";
import { getInterviewDocuments } from "./document.js";

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

interface GeneratedQuestion {
    text: string;
    category: string;
}

/**
 * Generates interview questions based on the candidate's resume, job description,
 * hiring criteria, and stage details. Stores them in the DB.
 */
export async function generateQuestions(interviewId: string, focusPrompt?: string): Promise<void> {
    // Gather all documents for this interview
    const docs = await getInterviewDocuments(interviewId);
    const interview = (await db.query("SELECT * FROM interviews WHERE id = $1", [interviewId])).rows[0];
    if (!interview) throw new Error("Interview not found");

    const resume = docs.find((d: any) => d.type === "resume")?.extracted_text || "";
    const jobDesc = docs.find((d: any) => d.type === "job_description")?.extracted_text || "";
    const criteria = docs.find((d: any) => d.type === "hiring_criteria")?.extracted_text || "";
    const stageDetails = interview.stage_details || "";

    // Get existing questions to avoid duplicates
    const existing = await db.query(
        "SELECT text FROM questions WHERE interview_id = $1 AND is_deleted = false",
        [interviewId],
    );
    const existingQuestions = existing.rows.map((r: any) => r.text);

    const systemPrompt = buildQuestionGenPrompt(resume, jobDesc, criteria, stageDetails, existingQuestions, focusPrompt);

    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
            systemInstruction: systemPrompt,
        },
        contents: [{ role: "user", parts: [{ text: "Generate the interview questions now." }] }],
    });

    const text = response.text ?? "";
    const questions = parseQuestions(text);

    if (questions.length === 0) {
        console.error("[question-gen] No questions parsed from LLM response:", text.slice(0, 200));
        return;
    }

    // Get current max sort_order
    const maxOrder = await db.query(
        "SELECT COALESCE(MAX(sort_order), 0) as max_order FROM questions WHERE interview_id = $1",
        [interviewId],
    );
    let sortOrder = maxOrder.rows[0].max_order + 1;

    // Insert questions
    for (const q of questions) {
        await db.query(
            "INSERT INTO questions (interview_id, text, category, sort_order) VALUES ($1, $2, $3, $4)",
            [interviewId, q.text, q.category, sortOrder++],
        );
    }

    console.log(`[question-gen] Generated ${questions.length} questions for interview ${interviewId}`);
}

function buildQuestionGenPrompt(
    resume: string,
    jobDesc: string,
    criteria: string,
    stageDetails: string,
    existingQuestions: string[],
    focusPrompt?: string,
): string {
    let prompt = `You are an expert interviewer preparing questions for a job interview.

Your goal is to help the interviewer thoroughly evaluate the candidate against ALL hiring criteria and verify their work experience with targeted deep-dive questions.

CANDIDATE RESUME:
${resume || "(No resume provided)"}

JOB DESCRIPTION:
${jobDesc || "(No job description provided)"}

HIRING CRITERIA:
${criteria || "(No hiring criteria provided)"}

INTERVIEW STAGE:
${stageDetails || "(No stage details provided)"}`;

    if (existingQuestions.length > 0) {
        prompt += `\n\nEXISTING QUESTIONS (do NOT generate duplicates of these):
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    }

    if (focusPrompt) {
        prompt += `\n\nFOCUS AREA (prioritize questions about this):
${focusPrompt}`;
    }

    prompt += `

INSTRUCTIONS:
- Generate ${focusPrompt ? "10-15" : "40-50"} interview questions.
- Start with 3-5 warm-up / introductory questions (e.g. "Tell me about yourself", "What interests you about this role?").
- Cover ALL hiring criteria thoroughly. Each criterion should have 3-5 questions ranging from surface-level to deep-dive.
- Include deep-dive questions that verify specific claims on the resume. Reference specific projects, technologies, or metrics they mention.
- Mix question types: technical, behavioral ("Tell me about a time..."), and situational ("What would you do if...").
- Order them from general/warm-up to specific/deep-dive.
- Each question should be self-contained (the interviewer can ask it without context).

OUTPUT FORMAT (one question per line, strictly follow this format):
[category] Question text here?

Categories: intro, technical, behavioral, situational, deep-dive

Example:
[intro] Can you give me a brief overview of your career and what led you to apply for this role?
[behavioral] Tell me about a time you had to make a difficult technical decision under pressure. What was the situation and what did you decide?
[deep-dive] You mentioned leading the migration to microservices at Company X. What was the biggest challenge you faced during that migration, and how did you handle it?
[technical] Can you walk me through how you would design a real-time notification system at scale?`;

    return prompt;
}

/**
 * Parses LLM output into structured questions.
 */
function parseQuestions(text: string): GeneratedQuestion[] {
    const lines = text.split("\n").filter((l) => l.trim());
    const questions: GeneratedQuestion[] = [];

    for (const line of lines) {
        const match = line.match(/^\[(\w[\w-]*)\]\s*(.+)/);
        if (match) {
            questions.push({ category: match[1], text: match[2].trim() });
        } else if (line.trim().endsWith("?")) {
            // Fallback: treat any line ending with ? as a question
            questions.push({ category: "general", text: line.trim() });
        }
    }

    return questions;
}
