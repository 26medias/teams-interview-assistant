# Teams Interview Assistant

AI-powered interview assistant for Microsoft Teams. Upload a candidate's resume, hiring criteria, and job description, then the assistant joins a Teams call to provide real-time question suggestions and follow-ups. After the call, it generates a full evaluation report.

## Components

| Directory | Description |
|-----------|-------------|
| `backend/` | Express API server (Postgres, Milvus, Gemini AI) |
| `frontend/` | React SPA (Vite, Tailwind CSS) |
| `meeting-bot/` | Playwright bridge — joins Teams, scrapes captions, sends to backend |
| `candidate-agent/` | Test tool — AI candidate that joins meetings and responds via TTS |
| `prototype/` | Early prototype — local audio transcription |

## Requirements

- **Node.js** >= 20
- **Docker** (for Postgres and Milvus)
- **Chromium** (installed automatically by Playwright)

## Quick Start

### 1. Start infrastructure

```bash
# Postgres
docker run -d --name interview-pg -p 5433:5432 \
  -e POSTGRES_DB=interview_assistant \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  postgres:16

# Milvus (required for real-time question suggestions)
docker run -d --name interview-milvus -p 19530:19530 \
  milvusdb/milvus:latest milvus run standalone
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env          # Edit with your API keys
npm run migrate                # Create database tables
npm run dev                    # Start server on http://localhost:3000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                    # Start on http://localhost:5173
```

### 4. Meeting Bot (auto-spawned by backend)

The meeting bot is spawned automatically when you click "Join Meeting" in the UI. For standalone testing:

```bash
cd meeting-bot
npm install
npx playwright install chromium
npm run bot -- --meeting <teams-url> --interview-id <uuid> --api-url http://localhost:3000 --token <bot-token>
```

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=3000
JWT_SECRET=<random-secret>
DATABASE_URL=postgresql://user:password@localhost:5433/interview_assistant
MILVUS_ADDRESS=localhost:19530
GEMINI_API_KEY=<your-gemini-api-key>
STORAGE_MODE=local
UPLOAD_DIR=./uploads
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000
```

### Candidate Agent (`candidate-agent/.env`) — for testing only

```env
GEMINI_API_KEY=<your-gemini-api-key>
ELEVENLABS_API_KEY=<your-elevenlabs-api-key>
ELEVENLABS_VOICE_ID=<voice-id>
```

## How It Works

1. **Create an interview** — upload resume, job description, hiring criteria, and stage details
2. **Questions are generated** — Gemini analyzes all documents and generates targeted questions covering every hiring criterion
3. **Join the meeting** — the meeting bot joins Teams as "Meeting Transcript Recorder" and scrapes live captions
4. **Real-time suggestions** — as the interview progresses, the system ranks pre-generated questions by relevance (Milvus RAG) and generates follow-up questions based on the conversation
5. **Report** — when the interview ends, Gemini generates a full evaluation: summary, strengths, concerns, rating (1-5), and recommended next steps
