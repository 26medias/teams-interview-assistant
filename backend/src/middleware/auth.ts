import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthPayload {
    userId: string;
    email: string;
}

declare global {
    namespace Express {
        interface Request {
            auth?: AuthPayload;
        }
    }
}

/**
 * Extract JWT from Authorization header or ?token query param (for SSE).
 */
function extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
        return header.slice(7);
    }
    // Fallback: query param (EventSource can't set headers)
    const queryToken = req.query.token;
    if (typeof queryToken === "string") {
        return queryToken;
    }
    return null;
}

/**
 * JWT auth middleware. Sets req.auth on success.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (!token) {
        res.status(401).json({ error: "Missing authorization token" });
        return;
    }

    try {
        const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
        req.auth = payload;
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}

/**
 * Bot auth — accepts a bot token via x-bot-token header.
 * Falls back to JWT if no bot token header.
 */
export function requireBotOrAuth(req: Request, res: Response, next: NextFunction): void {
    const botToken = req.headers["x-bot-token"] as string | undefined;
    if (botToken) {
        try {
            const payload = jwt.verify(botToken, config.jwtSecret) as { interviewId: string };
            (req as any).botInterviewId = payload.interviewId;
            next();
            return;
        } catch (err: any) {
            console.error("[auth] Bot token verification failed:", err.message, "token prefix:", botToken.slice(0, 20));
            res.status(401).json({ error: "Invalid bot token" });
            return;
        }
    }

    requireAuth(req, res, next);
}
