import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import * as interviewService from "../services/interview.js";
import { startBot, stopBot } from "../services/bot-manager.js";
import { setInterviewStatus } from "../services/interview.js";
import { generateReport } from "../services/report.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
    const interviews = await interviewService.getInterviews(req.auth!.userId);
    res.json(interviews);
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
        const { candidate_name, meeting_link, stage_details } = req.body;
        if (!candidate_name) {
            res.status(400).json({ error: "candidate_name is required" });
            return;
        }
        const interview = await interviewService.createInterview(
            req.auth!.userId, candidate_name, meeting_link, stage_details,
        );
        res.status(201).json(interview);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    const interview = await interviewService.getInterview(param(req, "id"), req.auth!.userId);
    if (!interview) {
        res.status(404).json({ error: "Interview not found" });
        return;
    }
    res.json(interview);
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    const interview = await interviewService.updateInterview(param(req, "id"), req.auth!.userId, req.body);
    if (!interview) {
        res.status(404).json({ error: "Interview not found" });
        return;
    }
    res.json(interview);
});

router.post("/:id/join", requireAuth, async (req: Request, res: Response) => {
    const interview = await interviewService.getInterview(param(req, "id"), req.auth!.userId);
    if (!interview) {
        res.status(404).json({ error: "Interview not found" });
        return;
    }
    if (!interview.meeting_link) {
        res.status(400).json({ error: "No meeting link set" });
        return;
    }
    if (interview.status === "in_progress") {
        res.status(400).json({ error: "Interview already in progress" });
        return;
    }

    startBot(interview.id, interview.meeting_link);
    const updated = await setInterviewStatus(interview.id, "in_progress");
    res.json(updated);
});

router.post("/:id/leave", requireAuth, async (req: Request, res: Response) => {
    const interview = await interviewService.getInterview(param(req, "id"), req.auth!.userId);
    if (!interview) {
        res.status(404).json({ error: "Interview not found" });
        return;
    }

    stopBot(interview.id);
    const updated = await setInterviewStatus(interview.id, "completed");

    generateReport(interview.id).catch((err) => {
        console.error("[report] Background generation failed:", err);
    });

    res.json(updated);
});

export default router;
