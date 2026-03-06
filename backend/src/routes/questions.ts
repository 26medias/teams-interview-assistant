import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import { db } from "../db/postgres.js";
import { generateQuestions } from "../services/question-gen.js";
import { insertQuestionEmbeddings } from "../services/embedding.js";

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
    const { text } = req.body;
    if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
    }

    const result = await db.query(
        `UPDATE questions
         SET text = $1, original_text = COALESCE(original_text, text), source = 'edited'
         WHERE id = $2 RETURNING *`,
        [text, param(req, "questionId")],
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
