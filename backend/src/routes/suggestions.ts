import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import { addSseClient, onNewTranscript } from "../services/suggestion.js";

const router = Router();

router.use(requireAuth);

router.get("/:interviewId/suggestions", async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.write(":ok\n\n");

    const interviewId = param(req, "interviewId");
    const cleanup = await addSseClient(interviewId, res);

    const keepalive = setInterval(() => {
        res.write(":keepalive\n\n");
    }, 30000);

    req.on("close", () => {
        cleanup();
        clearInterval(keepalive);
    });
});

// "More" button — re-triggers suggestion generation based on current transcript
router.post("/:interviewId/suggestions/more", async (req: Request, res: Response) => {
    const interviewId = param(req, "interviewId");
    onNewTranscript(interviewId).catch((err) => {
        console.error("[suggestion] More suggestions failed:", err);
    });
    res.json({ ok: true });
});

export default router;
