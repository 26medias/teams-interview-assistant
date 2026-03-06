import { Router, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { requireAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import { db } from "../db/postgres.js";
import { config } from "../config.js";
import { generateQuestions } from "../services/question-gen.js";
import { insertQuestionEmbeddings } from "../services/embedding.js";

const genai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const router = Router();

router.use(requireAuth);

router.get("/:interviewId/questions", async (req: Request, res: Response) => {
    const result = await db.query(
        `SELECT id, text, category, source, is_deleted, sort_order, created_at
         FROM questions WHERE interview_id = $1 AND is_deleted = false
         ORDER BY sort_order`,
        [param(req, "interviewId")],
    );
    res.json(result.rows);
});

router.post("/:interviewId/questions/generate", async (req: Request, res: Response) => {
    try {
        const interviewId = param(req, "interviewId");
        const { focus } = req.body || {};

        await generateQuestions(interviewId, focus);

        const questions = await db.query(
            "SELECT id, interview_id, text FROM questions WHERE interview_id = $1 AND is_deleted = false",
            [interviewId],
        );

        insertQuestionEmbeddings(questions.rows).catch((err) => {
            console.error("[embedding] Failed to index questions:", err);
        });

        res.json({ ok: true, count: questions.rows.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.patch("/questions/:questionId", async (req: Request, res: Response) => {
    const { text, feedback } = req.body;
    const questionId = param(req, "questionId");

    // AI edit: use feedback to generate a new version of the question
    if (feedback) {
        const existing = await db.query("SELECT text FROM questions WHERE id = $1", [questionId]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: "Question not found" });
            return;
        }

        const response = await genai.models.generateContent({
            model: "gemini-2.5-flash",
            config: { maxOutputTokens: 256 },
            contents: [{
                role: "user",
                parts: [{ text: `Rewrite this interview question based on the feedback. Output ONLY the new question, nothing else.

ORIGINAL QUESTION: ${existing.rows[0].text}

FEEDBACK: ${feedback}` }],
            }],
        });

        const newText = response.text?.trim();
        if (!newText) {
            res.status(500).json({ error: "AI edit produced no output" });
            return;
        }

        const result = await db.query(
            `UPDATE questions
             SET text = $1, original_text = COALESCE(original_text, text), source = 'ai_edited'
             WHERE id = $2 RETURNING *`,
            [newText, questionId],
        );
        res.json(result.rows[0]);
        return;
    }

    // Manual edit: direct text replacement
    if (!text) {
        res.status(400).json({ error: "text or feedback is required" });
        return;
    }

    const result = await db.query(
        `UPDATE questions
         SET text = $1, original_text = COALESCE(original_text, text), source = 'edited'
         WHERE id = $2 RETURNING *`,
        [text, questionId],
    );

    if (result.rows.length === 0) {
        res.status(404).json({ error: "Question not found" });
        return;
    }
    res.json(result.rows[0]);
});

router.delete("/questions/:questionId", async (req: Request, res: Response) => {
    await db.query("UPDATE questions SET is_deleted = true WHERE id = $1", [param(req, "questionId")]);
    res.json({ ok: true });
});

export default router;
