import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/postgres.js";
import { config } from "../config.js";

export async function signup(email: string, password: string, name: string) {
    // Check if user already exists
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
        throw new Error("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
        "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name",
        [email, passwordHash, name],
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email);
    return { user: { id: user.id, email: user.email, name: user.name }, token };
}

export async function login(email: string, password: string) {
    const result = await db.query("SELECT id, email, name, password_hash FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
        throw new Error("Invalid email or password");
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        throw new Error("Invalid email or password");
    }

    const token = generateToken(user.id, user.email);
    return { user: { id: user.id, email: user.email, name: user.name }, token };
}

function generateToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, config.jwtSecret, { expiresIn: "7d" });
}

/**
 * Generate a short-lived bot token scoped to a specific interview.
 */
export function generateBotToken(interviewId: string): string {
    return jwt.sign({ interviewId }, config.jwtSecret, { expiresIn: "8h" });
}
