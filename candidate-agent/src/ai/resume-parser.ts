import { readFileSync } from "fs";
import pdfParse from "pdf-parse";

/**
 * Extracts text content from a PDF resume.
 */
export async function parseResume(filePath: string): Promise<string> {
    console.log(`[resume] Parsing ${filePath}...`);

    const buffer = readFileSync(filePath);
    const data = await pdfParse(buffer);

    const text = data.text.trim();
    if (!text) {
        throw new Error("Could not extract text from resume PDF. The file may be image-based (OCR not supported).");
    }

    console.log(`[resume] Extracted ${text.length} characters from ${data.numpages} page(s)`);
    return text;
}
