import { GoogleGenAI } from "@google/genai";
import { MilvusClient, DataType } from "@zilliz/milvus2-sdk-node";
import { config } from "../config.js";

const genai = new GoogleGenAI({ apiKey: config.geminiApiKey });

let milvus: MilvusClient | null = null;
const COLLECTION = "question_embeddings";
const EMBEDDING_DIM = 3072; // gemini-embedding-001 dimension

async function getClient(): Promise<MilvusClient> {
    if (!milvus) {
        milvus = new MilvusClient({ address: config.milvusAddress });
        await ensureCollection();
    }
    return milvus;
}

async function ensureCollection(): Promise<void> {
    if (!milvus) return;

    const exists = await milvus.hasCollection({ collection_name: COLLECTION });
    if (exists.value) return;

    await milvus.createCollection({
        collection_name: COLLECTION,
        fields: [
            { name: "id", data_type: DataType.VarChar, is_primary_key: true, max_length: 64 },
            { name: "interview_id", data_type: DataType.VarChar, max_length: 64 },
            { name: "text", data_type: DataType.VarChar, max_length: 2048 },
            { name: "embedding", data_type: DataType.FloatVector, dim: EMBEDDING_DIM },
        ],
    });

    await milvus.createIndex({
        collection_name: COLLECTION,
        field_name: "embedding",
        index_type: "IVF_FLAT",
        metric_type: "COSINE",
        params: { nlist: 128 },
    });

    await milvus.loadCollection({ collection_name: COLLECTION });
    console.log("[milvus] Collection created and loaded");
}

/**
 * Embed text using Gemini embedding model.
 */
export async function embedText(text: string): Promise<number[]> {
    const result = await genai.models.embedContent({
        model: "gemini-embedding-001",
        contents: [{ role: "user", parts: [{ text }] }],
    });
    return result.embeddings?.[0]?.values || [];
}

/**
 * Insert question embeddings into Milvus.
 */
export async function insertQuestionEmbeddings(
    questions: Array<{ id: string; interview_id: string; text: string }>,
): Promise<void> {
    if (questions.length === 0) return;

    const client = await getClient();

    // Embed all questions
    const embeddings = await Promise.all(questions.map((q) => embedText(q.text)));

    await client.insert({
        collection_name: COLLECTION,
        data: questions.map((q, i) => ({
            id: q.id,
            interview_id: q.interview_id,
            text: q.text,
            embedding: embeddings[i],
        })),
    });
}

/**
 * Search for the most relevant questions given a transcript context.
 * Returns question IDs ranked by relevance.
 */
export async function searchRelevantQuestions(
    interviewId: string,
    contextText: string,
    topK: number = 10,
): Promise<Array<{ id: string; text: string; score: number }>> {
    const client = await getClient();
    const queryEmbedding = await embedText(contextText);

    const results = await client.search({
        collection_name: COLLECTION,
        vector: queryEmbedding,
        limit: topK,
        filter: `interview_id == "${interviewId}"`,
        output_fields: ["id", "text"],
    });

    return (results.results || []).map((r: any) => ({
        id: r.id,
        text: r.text,
        score: r.score,
    }));
}

/**
 * Delete all embeddings for an interview (cleanup).
 */
export async function deleteInterviewEmbeddings(interviewId: string): Promise<void> {
    try {
        const client = await getClient();
        await client.delete({
            collection_name: COLLECTION,
            filter: `interview_id == "${interviewId}"`,
        });
    } catch {
        // Collection may not exist yet
    }
}
