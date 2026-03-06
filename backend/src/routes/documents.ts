import { Router, Request, Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { param } from "../middleware/params.js";
import * as documentService from "../services/document.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth);

router.post("/:interviewId/documents", upload.single("file"), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        const type = req.body.type;
        if (!type || !["resume", "job_description", "hiring_criteria"].includes(type)) {
            res.status(400).json({ error: "type must be resume, job_description, or hiring_criteria" });
            return;
        }

        const interviewId = param(req, "interviewId");
        const doc = await documentService.uploadDocument(
            req.auth!.userId, interviewId, type, req.file.originalname, req.file.buffer,
        );

        await documentService.attachDocument(interviewId, doc.id);
        res.status(201).json(doc);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.post("/:interviewId/documents/attach", async (req: Request, res: Response) => {
    try {
        const { document_id } = req.body;
        if (!document_id) {
            res.status(400).json({ error: "document_id is required" });
            return;
        }
        await documentService.attachDocument(param(req, "interviewId"), document_id);
        res.json({ ok: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.get("/:interviewId/documents", async (req: Request, res: Response) => {
    const docs = await documentService.getInterviewDocuments(param(req, "interviewId"));
    res.json(docs);
});

router.get("/", async (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const docs = await documentService.getUserDocuments(req.auth!.userId, type);
    res.json(docs);
});

export default router;
