import { Router, Request, Response } from "express";
import * as authService from "../services/auth.js";

const router = Router();

router.post("/signup", async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            res.status(400).json({ error: "Email, password, and name are required" });
            return;
        }
        const result = await authService.signup(email, password, name);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }
        const result = await authService.login(email, password);
        res.json(result);
    } catch (err: any) {
        res.status(401).json({ error: err.message });
    }
});

export default router;
