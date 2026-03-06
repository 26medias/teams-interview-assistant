import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import { getReport } from "../services/report.js";

const router = Router();

router.use(requireAuth);

router.get("/:interviewId/report", async (req: Request, res: Response) => {
    const report = await getReport(param(req, "interviewId"));
    if (!report) {
        res.status(404).json({ error: "Report not found — it may still be generating" });
        return;
    }
    res.json(report);
});

router.get("/:interviewId/report/markdown", async (req: Request, res: Response) => {
    const report = await getReport(param(req, "interviewId"));
    if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
    }
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", `attachment; filename="interview-report.md"`);
    res.send(report.raw_markdown);
});

export default router;
