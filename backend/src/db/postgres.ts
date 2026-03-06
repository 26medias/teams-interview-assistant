import pg from "pg";
import { config } from "../config.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });

pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message);
});

export const db = {
    query: (text: string, params?: unknown[]) => pool.query(text, params),
    pool,
};
