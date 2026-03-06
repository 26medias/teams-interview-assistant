import "dotenv/config";

export const config = {
    port: parseInt(process.env.PORT || "3000"),
    jwtSecret: process.env.JWT_SECRET || "dev-secret",
    databaseUrl: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/interview_assistant",
    milvusAddress: process.env.MILVUS_ADDRESS || "localhost:19530",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    storageMode: process.env.STORAGE_MODE || "local",
    uploadDir: process.env.UPLOAD_DIR || "./uploads",
    botPath: process.env.BOT_PATH || "../meeting-bot",
};
