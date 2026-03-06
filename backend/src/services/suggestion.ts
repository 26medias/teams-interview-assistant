import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { db } from "../db/postgres.js";
import { searchRelevantQuestions } from "./embedding.js";
import { getInterviewDocuments } from "./document.js";

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

// SSE clients per interview — each is a response object we write to
const sseClients = new Map<string, Set<any>>();

/**
 * Register an SSE client for an interview's suggestions.
 * Immediately sends pre-generated questions so the panel is never empty.
 */
export async function addSseClient(interviewId: string, res: any): Promise<() => void> {
    if (!sseClients.has(interviewId)) {
        sseClients.set(interviewId, new Set());
    }
    sseClients.get(interviewId)!.add(res);

    // Send initial questions immediately so the interviewer always has guidance
    try {
        const questions = await db.query(
            "SELECT id, text, category FROM questions WHERE interview_id = $1 AND is_deleted = false ORDER BY sort_order",
            [interviewId],
        );
        if (questions.rows.length > 0) {
            const payload = `data: ${JSON.stringify({
                prepared: questions.rows.slice(0, 5).map((q: any) => ({
                    id: q.id,
                    text: q.text,
                    category: q.category,
                })),
                followUps: [],
            })}\n\n`;
            try { res.write(payload); } catch { /* ignore */ }
        }
    } catch {
        // DB might not be ready
    }

    return () => {
        sseClients.get(interviewId)?.delete(res);
    };
}

/**
 * Push a suggestion update to all SSE clients for an interview.
 */
function pushToClients(interviewId: string, data: unknown): void {
    const clients = sseClients.get(interviewId);
    if (!clients) return;

    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try {
            res.write(payload);
        } catch {
            clients.delete(res);
        }
    }
}

/**
 * Called when a new transcript segment arrives.
 * Sends two sections: uncovered prepared questions + real-time follow-ups.
 */
export async function onNewTranscript(interviewId: string): Promise<void> {
    try {
        // Get full transcript for coverage analysis
        const fullTranscript = await db.query(
            `SELECT speaker, text FROM transcript_segments
             WHERE interview_id = $1 ORDER BY timestamp`,
            [interviewId],
        );
        if (fullTranscript.rows.length === 0) return;

        const fullText = fullTranscript.rows.map((r: any) => r.text).join(" ").toLowerCase();

        // Recent context for follow-up generation (last 10 segments)
        const recentRows = fullTranscript.rows.slice(-10);
        const recentContext = recentRows
            .map((r: any) => `${r.speaker}: ${r.text}`)
            .join("\n");

        // 1. Get ALL pre-generated questions and filter out covered ones
        const allQuestions = await db.query(
            "SELECT id, text, category FROM questions WHERE interview_id = $1 AND is_deleted = false ORDER BY sort_order",
            [interviewId],
        );

        const uncovered = allQuestions.rows.filter((q: any) => {
            const keywords = q.text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 5);
            if (keywords.length === 0) return true;
            const coveredCount = keywords.filter((w: string) => fullText.includes(w)).length;
            return coveredCount < keywords.length * 0.5;
        });

        // Use Milvus RAG to rank uncovered questions by relevance to current conversation
        let ranked = uncovered;
        try {
            const relevant = await searchRelevantQuestions(interviewId, recentContext, 20);
            const relevantIds = new Set(relevant.map((r) => r.id));
            // Put RAG-relevant questions first, then the rest
            const top = uncovered.filter((q: any) => relevantIds.has(q.id));
            const rest = uncovered.filter((q: any) => !relevantIds.has(q.id));
            ranked = [...top, ...rest];
        } catch {
            // Milvus unavailable — use sort_order as-is
        }

        // 2. Generate follow-up questions from the latest discussion
        const followUps = await generateFollowUps(interviewId, recentContext);

        // 3. Push two-section update
        pushToClients(interviewId, {
            prepared: ranked.slice(0, 5).map((q: any) => ({
                id: q.id,
                text: q.text,
                category: q.category,
            })),
            followUps: followUps.map((text, i) => ({
                id: `followup-${Date.now()}-${i}`,
                text,
            })),
        });
    } catch (err) {
        console.error("[suggestion] Error generating suggestions:", err);
    }
}

/**
 * Generate follow-up questions based on the recent transcript.
 */
async function generateFollowUps(interviewId: string, recentTranscript: string): Promise<string[]> {
    // Get interview context
    const interview = (await db.query("SELECT * FROM interviews WHERE id = $1", [interviewId])).rows[0];
    if (!interview) return [];

    const docs = await getInterviewDocuments(interviewId);
    const criteria = docs.find((d: any) => d.type === "hiring_criteria")?.extracted_text || "";
    const resume = docs.find((d: any) => d.type === "resume")?.extracted_text || "";

    const prompt = `You are an expert interviewer assistant. Based on the recent conversation transcript, suggest 2-3 follow-up questions the interviewer should ask next.

GOAL: Help the interviewer cover all hiring criteria and verify the candidate's experience through deep dives.

HIRING CRITERIA:
${criteria || "(Not provided)"}

CANDIDATE RESUME (key points):
${resume ? resume.slice(0, 1000) : "(Not provided)"}

RECENT TRANSCRIPT:
${recentTranscript}

Generate 2-3 follow-up questions. Focus on:
- Digging deeper into what the candidate just said
- Verifying specific claims or experience
- Covering hiring criteria not yet discussed
- Probing for concrete examples, numbers, and outcomes

Output one question per line, no numbering, no prefixes.`;

    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        config: { maxOutputTokens: 512 },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = response.text ?? "";
    return text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 10 && l.endsWith("?"));
}
