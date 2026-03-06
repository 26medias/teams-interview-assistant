import { Router, Request, Response } from "express";
import { requireAuth, requireBotOrAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import { db } from "../db/postgres.js";
import { onNewTranscript } from "../services/suggestion.js";

const router = Router();

router.post("/:interviewId/transcript", requireBotOrAuth, async (req: Request, res: Response) => {
    try {
        const { speaker, text, timestamp } = req.body;
        if (!speaker || !text || !timestamp) {
            res.status(400).json({ error: "speaker, text, and timestamp are required" });
            return;
        }

        const interviewId = param(req, "interviewId");
        await db.query(
            "INSERT INTO transcript_segments (interview_id, speaker, text, timestamp) VALUES ($1, $2, $3, $4)",
            [interviewId, speaker, text, timestamp],
        );

        onNewTranscript(interviewId).catch((err) => {
            console.error("[suggestion] Background generation failed:", err);
        });

        res.status(201).json({ ok: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.get("/:interviewId/transcript", requireAuth, async (req: Request, res: Response) => {
    const result = await db.query(
        "SELECT id, speaker, text, timestamp FROM transcript_segments WHERE interview_id = $1 ORDER BY timestamp",
        [param(req, "interviewId")],
    );
    res.json(result.rows);
});

export default router;
