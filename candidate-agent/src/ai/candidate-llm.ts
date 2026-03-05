import { GoogleGenAI } from "@google/genai";

export interface ConversationTurn {
    role: "interviewer" | "candidate";
    text: string;
}

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/**
 * Generates a candidate response using Gemini 2.5 Flash, based on the resume,
 * behavior directive, and conversation history.
 */
export async function generateResponse(
    resumeText: string,
    candidateName: string,
    behavior: string,
    conversationHistory: ConversationTurn[],
    verbose: boolean,
): Promise<string> {
    const systemPrompt = buildSystemPrompt(resumeText, candidateName, behavior);

    // Map conversation to Gemini content format
    const contents = conversationHistory.map((turn) => ({
        role: turn.role === "interviewer" ? "user" as const : "model" as const,
        parts: [{ text: turn.text }],
    }));

    if (verbose) {
        const lastTurn = conversationHistory[conversationHistory.length - 1];
        console.log(`[llm] Generating response to: "${lastTurn?.text.slice(0, 80)}..."`);
    }

    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: 1024,
        },
        contents,
    });

    const text = response.text ?? "";

    if (verbose) {
        console.log(`[llm] Response: "${text.slice(0, 120)}..."`);
    }

    return text;
}

function buildSystemPrompt(resumeText: string, candidateName: string, behavior: string): string {
    return `You are ${candidateName}, a job candidate currently in a live interview.

BEHAVIOR DIRECTIVE:
${behavior}

Your resume is provided below. The behavior directive above controls how you should act during this interview. Follow it faithfully — it overrides default behavior.

Examples of behavior directives and what they mean:
- "The candidate has lied on their resume and does not know any details of the implementations"
  → Be vague, deflect technical questions, make things up poorly, get caught in inconsistencies.
- "The candidate is a senior who aces the interview"
  → Give detailed, confident, technically deep answers that demonstrate expertise.
- "The candidate is nervous and gives short answers"
  → Stammer slightly, give brief responses, seem uncertain.

RULES:
- Answer naturally and conversationally, as if you are this person in a real interview.
- Keep responses concise: 2-4 sentences for simple questions, longer for deep-dives.
- Speak in first person. Use natural speech patterns (contractions, occasional filler words).
- Do not use bullet points, numbered lists, or any formatting. Speak in natural paragraphs.
- Do not narrate your actions. Just answer.

RESUME:
${resumeText}`;
}
