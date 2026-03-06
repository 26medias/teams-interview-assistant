import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { stopAllBots } from "./services/bot-manager.js";

import authRoutes from "./routes/auth.js";
import interviewRoutes from "./routes/interviews.js";
import documentRoutes from "./routes/documents.js";
import questionRoutes from "./routes/questions.js";
import transcriptRoutes from "./routes/transcript.js";
import suggestionRoutes from "./routes/suggestions.js";
import reportRoutes from "./routes/report.js";
import { requireAuth } from "./middleware/auth.js";
import { getUserDocuments } from "./services/document.js";

const app = express();

app.use(cors());
app.use(express.json());

// Health check (before auth routes)
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});

// Standalone route for document picker (not under /api/interviews to avoid router.use(requireAuth) conflicts)
app.get("/api/documents", requireAuth, async (req, res) => {
    const type = req.query.type as string | undefined;
    const docs = await getUserDocuments(req.auth!.userId, type);
    res.json(docs);
});

// Routes
app.use("/api/auth", authRoutes);
// Transcript MUST be before other /api/interviews routers — it uses requireBotOrAuth per-route
// while others use router-level requireAuth that would reject bot tokens
app.use("/api/interviews", transcriptRoutes);
app.use("/api/interviews", interviewRoutes);
// Documents: /api/interviews/:id/documents AND /api/documents
app.use("/api/interviews", documentRoutes);
// Questions: /api/interviews/:id/questions AND /api/questions/:id
app.use("/api/interviews", questionRoutes);
app.use("/api", questionRoutes);
// Suggestions: /api/interviews/:id/suggestions (SSE)
app.use("/api/interviews", suggestionRoutes);
// Report: /api/interviews/:id/report
app.use("/api/interviews", reportRoutes);

app.listen(config.port, () => {
    console.log(`[server] Running on http://localhost:${config.port}`);
});

// Cleanup on shutdown
process.on("SIGINT", () => {
    console.log("\n[server] Shutting down...");
    stopAllBots();
    process.exit(0);
});
