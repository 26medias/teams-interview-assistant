import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "./postgres.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
    console.log("[migrate] Running migrations...");

    const sql1 = readFileSync(join(__dirname, "migrations/001_initial.sql"), "utf-8");
    await db.query(sql1);

    const sql2 = readFileSync(join(__dirname, "migrations/002_criteria.sql"), "utf-8");
    await db.query(sql2);

    console.log("[migrate] Done.");
    process.exit(0);
}

migrate().catch((err) => {
    console.error("[migrate] Failed:", err);
    process.exit(1);
});
