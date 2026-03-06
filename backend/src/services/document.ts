import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { db } from "../db/postgres.js";
import { config } from "../config.js";

// pdf-parse has no named exports
import pdfParse from "pdf-parse";

/**
 * Stores an uploaded file and extracts text content.
 */
export async function uploadDocument(
    userId: string,
    interviewId: string | null,
    type: string,
    filename: string,
    buffer: Buffer,
) {
    // Store file
    const storagePath = await storeFile(filename, buffer);

    // Extract text from PDF
    let extractedText: string | null = null;
    if (extname(filename).toLowerCase() === ".pdf") {
        try {
            const parsed = await pdfParse(buffer);
            extractedText = parsed.text;
        } catch (err) {
            console.error("[document] PDF parse error:", err);
        }
    } else {
        // Plain text files
        extractedText = buffer.toString("utf-8");
    }

    const result = await db.query(
        `INSERT INTO documents (user_id, interview_id, type, filename, storage_path, extracted_text)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, type, filename, created_at`,
        [userId, interviewId, type, filename, storagePath, extractedText],
    );

    return result.rows[0];
}

/**
 * Attach an existing document to an interview.
 */
export async function attachDocument(interviewId: string, documentId: string) {
    await db.query(
        `INSERT INTO interview_documents (interview_id, document_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [interviewId, documentId],
    );
}

/**
 * Get documents for an interview (both directly uploaded and attached).
 */
export async function getInterviewDocuments(interviewId: string) {
    const result = await db.query(
        `SELECT d.id, d.type, d.filename, d.extracted_text, d.created_at
         FROM documents d
         LEFT JOIN interview_documents id ON d.id = id.document_id
         WHERE d.interview_id = $1 OR id.interview_id = $1
         ORDER BY d.created_at`,
        [interviewId],
    );
    return result.rows;
}

/**
 * Get all documents of a given type for a user (for the document picker).
 */
export async function getUserDocuments(userId: string, type?: string) {
    if (type) {
        const result = await db.query(
            "SELECT id, type, filename, created_at FROM documents WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC",
            [userId, type],
        );
        return result.rows;
    }
    const result = await db.query(
        "SELECT id, type, filename, created_at FROM documents WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
    );
    return result.rows;
}

/**
 * Get extracted text for a specific document.
 */
export async function getDocumentText(documentId: string): Promise<string | null> {
    const result = await db.query("SELECT extracted_text FROM documents WHERE id = $1", [documentId]);
    return result.rows[0]?.extracted_text || null;
}

async function storeFile(filename: string, buffer: Buffer): Promise<string> {
    const dir = config.uploadDir;
    mkdirSync(dir, { recursive: true });
    const storedName = `${randomUUID()}${extname(filename)}`;
    const filePath = join(dir, storedName);
    writeFileSync(filePath, buffer);
    return filePath;
}
