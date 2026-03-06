# V1 Implementation Plan

First production version of the Teams Interview Assistant. Three new components: **meeting-bot** (Playwright bridge), **backend** (API + AI), **frontend** (React SPA).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Frontend (React SPA)                     │
│   Auth → Dashboard → Create Interview → Live View → Report        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST + WebSocket (SSE)
┌────────────────────────────▼─────────────────────────────────────┐
│                        Backend (Node/Express)                     │
│                                                                   │
│  Auth │ Interviews CRUD │ Document Upload │ Question Gen │ Report │
│       │                 │ (GCS Bucket)    │ (Gemini+RAG) │        │
│       │                 │                 │              │        │
│  Postgres (relational)  │  Milvus (embeddings/RAG)       │        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST (POST transcript segments)
┌────────────────────────────▼─────────────────────────────────────┐
│                     Meeting Bot (Playwright)                      │
│                                                                   │
│  Joins Teams as "Meeting Transcript Recorder"                     │
│  Scrapes live captions → POSTs to backend                         │
│  No audio output, no mic, no camera                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Meeting Bot (`meeting-bot/`)

A stripped-down version of the candidate-agent. Joins Teams via Playwright, scrapes live captions, and forwards transcript segments to the backend via HTTP.

### Responsibilities
- Join a Teams meeting link as "Meeting Transcript Recorder"
- Enable live captions
- Scrape caption DOM for speaker name + text
- POST each finalized utterance to `POST /api/interviews/:id/transcript`
- Leave meeting on command (backend calls or SIGINT)

### What we reuse from candidate-agent
- `join.ts` — Playwright meeting join flow (remove ALL audio injection code: no addInitScript, no Web Audio API, no getUserMedia override, no RTCPeerConnection intercepts)
- `captions.ts` — Caption scraping + utterance detection (remove candidateName self-filter since the bot doesn't speak)

### File structure

```
meeting-bot/
├── package.json
├── tsconfig.json
├── .env
└── src/
    ├── index.ts              # CLI: --meeting <url> --interview-id <id> --api-url <url>
    ├── meeting/
    │   └── join.ts           # Playwright join (no audio, no camera, no mic injection)
    ├── transcription/
    │   └── captions.ts       # Caption scraping (simplified: no self-filter, no reset)
    └── bridge.ts             # Orchestrator: join → scrape → POST to backend
```

### CLI

```bash
npm run bot -- --meeting <url> --interview-id <uuid> --api-url http://localhost:3000
```

The backend spawns this process when the user clicks "Join meeting" in the UI. It passes the meeting link and interview ID.

### Key differences from candidate-agent
- No TTS, no LLM, no resume parsing, no audio pipeline
- `join.ts` doesn't inject any audio — just joins silently with mic+camera off
- `captions.ts` emits ALL speakers (no self-filter needed)
- `bridge.ts` POSTs utterances to the backend as they arrive:
  ```
  POST /api/interviews/:id/transcript
  { "speaker": "Unknown", "text": "Tell me about your experience", "timestamp": "2026-03-06T..." }
  ```

### Dependencies
- `playwright` — browser automation
- `dotenv` — env loading

---

## 2. Backend (`backend/`)

TypeScript Express server. Manages interviews, stores documents, generates questions via Gemini + Milvus RAG, receives live transcript from the meeting bot, generates real-time follow-up suggestions, and produces post-interview reports.

### File structure

```
backend/
├── package.json
├── tsconfig.json
├── .env
└── src/
    ├── index.ts                    # Express app setup, middleware, route registration
    ├── config.ts                   # Env vars, DB connection strings, GCS config
    ├── db/
    │   ├── postgres.ts             # Postgres client (pg)
    │   ├── milvus.ts               # Milvus client
    │   └── migrations/
    │       └── 001_initial.sql     # Create tables
    ├── storage/
    │   └── gcs.ts                  # Google Cloud Storage upload/download (or local fs for dev)
    ├── routes/
    │   ├── auth.ts                 # POST /auth/signup, POST /auth/login
    │   ├── interviews.ts           # CRUD + join/leave/status
    │   ├── documents.ts            # Upload resume, job desc, hiring criteria
    │   ├── transcript.ts           # POST segments (from bot), GET full transcript
    │   ├── questions.ts            # GET generated questions, POST generate more
    │   └── suggestions.ts          # SSE endpoint for real-time follow-up suggestions
    ├── services/
    │   ├── auth.ts                 # JWT + bcrypt
    │   ├── interview.ts            # Interview lifecycle (create, start, complete)
    │   ├── document.ts             # Upload to GCS, extract text (pdf-parse)
    │   ├── question-gen.ts         # Gemini: generate questions from resume + JD + criteria
    │   ├── embedding.ts            # Gemini embedding API → Milvus insert/search
    │   ├── suggestion.ts           # Real-time: rank questions + generate follow-ups from transcript
    │   ├── report.ts               # Post-interview: summary, pros/cons, rating, recommendation
    │   └── bot-manager.ts          # Spawn/kill meeting-bot process
    └── middleware/
        └── auth.ts                 # JWT verification middleware
```

### Database schema (Postgres)

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Interviews
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    candidate_name TEXT NOT NULL,
    meeting_link TEXT,
    stage_details TEXT,              -- "intro", "deep dive", free text
    status TEXT DEFAULT 'upcoming',  -- upcoming | in_progress | completed
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Documents (resume, job description, hiring criteria)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    interview_id UUID REFERENCES interviews(id),  -- NULL = reusable across interviews
    type TEXT NOT NULL,              -- resume | job_description | hiring_criteria
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,      -- GCS path or local path
    extracted_text TEXT,             -- Extracted text content for AI processing
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Link table: which documents are attached to which interview
CREATE TABLE interview_documents (
    interview_id UUID REFERENCES interviews(id) NOT NULL,
    document_id UUID REFERENCES documents(id) NOT NULL,
    PRIMARY KEY (interview_id, document_id)
);

-- Generated questions
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) NOT NULL,
    text TEXT NOT NULL,
    category TEXT,                   -- technical, behavioral, situational, follow-up
    source TEXT DEFAULT 'generated', -- generated | manual | edited
    original_text TEXT,              -- Before manual edit (NULL if never edited)
    is_deleted BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Transcript segments (from meeting bot)
CREATE TABLE transcript_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Interview reports (generated after completion)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) UNIQUE NOT NULL,
    summary TEXT,
    pros TEXT,                       -- JSON array
    cons TEXT,                       -- JSON array
    rating INT,                      -- 1-5
    recommendation TEXT,
    raw_markdown TEXT,               -- Full exportable report
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Milvus collections

One collection for question embeddings per interview, used to rank which pre-generated questions are most relevant given the current transcript context.

```
Collection: question_embeddings
Fields:
  - id (VARCHAR, primary key) — matches questions.id
  - interview_id (VARCHAR)
  - embedding (FLOAT_VECTOR, dim=768) — Gemini text-embedding-004
  - text (VARCHAR) — question text for retrieval
```

### API Endpoints

#### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account (email, password, name) |
| POST | `/api/auth/login` | Login → JWT token |

#### Interviews
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interviews` | List user's interviews |
| POST | `/api/interviews` | Create interview |
| GET | `/api/interviews/:id` | Get interview details |
| PATCH | `/api/interviews/:id` | Update (meeting link, stage details) |
| POST | `/api/interviews/:id/join` | Start meeting bot → sets status=in_progress |
| POST | `/api/interviews/:id/leave` | Stop meeting bot → sets status=completed, triggers report generation |

#### Documents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/interviews/:id/documents` | Upload document (multipart) |
| GET | `/api/documents?type=job_description` | List user's reusable documents |
| POST | `/api/interviews/:id/documents/attach` | Attach existing document to interview |

#### Questions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interviews/:id/questions` | List questions for interview |
| POST | `/api/interviews/:id/questions/generate` | Generate questions (optionally with focus prompt) |
| PATCH | `/api/questions/:id` | Edit question text |
| DELETE | `/api/questions/:id` | Soft-delete question |

#### Transcript
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/interviews/:id/transcript` | Add segment (from meeting bot, no auth — uses bot token) |
| GET | `/api/interviews/:id/transcript` | Get full transcript |

#### Real-time suggestions (SSE)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interviews/:id/suggestions` | SSE stream: pushes new suggestions as transcript grows |

#### Report
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interviews/:id/report` | Get report |
| GET | `/api/interviews/:id/report/markdown` | Export as markdown file |

### AI Services

#### Question Generation (`question-gen.ts`)
- Input: resume text + job description + hiring criteria + stage details
- Model: Gemini 2.5 Flash
- Output: 15-25 categorized questions (technical, behavioral, situational)
- Each question is embedded via `text-embedding-004` and stored in Milvus

#### Real-time Suggestions (`suggestion.ts`)
When a new transcript segment arrives:
1. Embed the latest transcript context (last ~500 words)
2. Vector search Milvus for the 5 most relevant pre-generated questions that haven't been "used" (i.e., the topic hasn't already been covered in transcript)
3. Generate 2-3 follow-up questions from the latest transcript using Gemini Flash
4. Push combined suggestions via SSE to the frontend

#### Report Generation (`report.ts`)
Triggered when interview is marked complete:
- Input: full transcript + resume + job description + hiring criteria + stage details
- Model: Gemini 2.5 Flash (large context)
- Output: summary, pros array, cons array, rating (1-5), recommended next steps
- Stored in `reports` table + rendered as markdown for export

### Bot Manager (`bot-manager.ts`)
- Spawns `meeting-bot` as a child process with `--meeting`, `--interview-id`, `--api-url` args
- Tracks running bots per interview ID
- Kills bot process on leave or server shutdown
- Passes a short-lived bot token for transcript POST auth

### Dependencies
- `express` — HTTP server
- `pg` — Postgres client
- `@zilliz/milvus2-sdk-node` — Milvus client
- `@google/genai` — Gemini Flash + embedding API
- `@google-cloud/storage` — GCS (prod) / local fs adapter (dev)
- `pdf-parse` — PDF text extraction
- `bcryptjs` — password hashing
- `jsonwebtoken` — JWT auth
- `multer` — file upload handling
- `cors` — CORS middleware
- `dotenv` — env loading

---

## 3. Frontend (`frontend/`)

React SPA with Tailwind CSS and hash router. Communicates with the backend via REST + SSE.

### File structure

```
frontend/
├── package.json
├── tsconfig.json
├── index.html
├── tailwind.config.js
├── vite.config.ts
└── src/
    ├── main.tsx                     # Entry point, router setup
    ├── api/
    │   └── client.ts               # Fetch wrapper with JWT, base URL, SSE helpers
    ├── auth/
    │   ├── AuthContext.tsx          # Auth state provider (JWT in localStorage)
    │   ├── LoginPage.tsx
    │   └── SignupPage.tsx
    ├── dashboard/
    │   ├── DashboardPage.tsx        # Interview list + "Create new interview" button
    │   └── InterviewCard.tsx        # Status badge, candidate name, date
    ├── interview/
    │   ├── CreateInterviewPage.tsx   # Form: name, link, uploads, stage details
    │   ├── InterviewDetailPage.tsx   # Router between Upcoming/InProgress/Completed views
    │   ├── UpcomingView.tsx          # Questions list, edit, generate more, join button
    │   ├── InProgressView.tsx        # Live transcript, suggestions panel, question bank
    │   └── CompletedView.tsx         # Report display, transcript, export button
    ├── components/
    │   ├── Layout.tsx               # Nav bar, page shell
    │   ├── FileUpload.tsx           # Drag-and-drop file upload with preview
    │   ├── DocumentPicker.tsx       # Select from previously uploaded documents
    │   ├── QuestionList.tsx         # Editable question list with delete/edit/AI-edit
    │   ├── TranscriptPanel.tsx      # Scrolling transcript with speaker labels
    │   └── SuggestionsPanel.tsx     # Real-time question suggestions (SSE-driven)
    └── types.ts                     # Shared TypeScript types
```

### Pages & Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `#/login` | LoginPage | Email + password login |
| `#/signup` | SignupPage | Create account |
| `#/` | DashboardPage | List interviews, create new |
| `#/interviews/new` | CreateInterviewPage | New interview form |
| `#/interviews/:id` | InterviewDetailPage | Detail view (switches on status) |

### Key UI Details

#### Create Interview (`CreateInterviewPage`)
- Candidate name (text)
- Teams meeting link (text)
- Resume upload (file) OR select from previously uploaded
- Job description upload (file) OR select from previously uploaded
- Hiring criteria upload (file) OR select from previously uploaded
- Stage details (textarea): "Intro call", "Technical deep dive — validate AI/ML experience", etc.
- On submit: creates interview, uploads documents, triggers question generation

#### Upcoming View (`UpcomingView`)
- Candidate summary card (name, extracted resume highlights)
- Question bank: generated questions with category badges
  - Click to edit inline
  - Delete button (soft delete)
  - "AI Edit" button → text input for feedback → regenerated question
- "Generate more questions" button → prompt for focus area → generates additional questions
- "Update meeting link" button
- **"Join meeting" button** → calls `POST /api/interviews/:id/join` → status changes to in_progress

#### In Progress View (`InProgressView`)
- Left panel: live transcript (scrolling, auto-scroll to bottom)
  - Speaker name + text per segment
  - New segments appear via SSE or polling
- Right panel: suggestions
  - Top 5 suggested next questions (from RAG + follow-up generation)
  - "More" button to load additional suggestions
  - Questions fade/mark as "covered" when transcript indicates the topic was discussed
- Bottom: full question bank (collapsible) — all pre-generated questions

#### Completed View (`CompletedView`)
- Full transcript (collapsible)
- Report sections:
  - Summary paragraph
  - Pros (bulleted)
  - Cons (bulleted)
  - Rating (1-5 stars or numeric)
  - Recommended decision / next steps
- "Export to Markdown" button → downloads .md file

---

## 4. Implementation Order

Build in this sequence so each piece is testable before the next depends on it.

### Phase 1: Backend Core
1. `backend/` project setup (Express, TypeScript, Postgres, env)
2. DB migrations (all tables)
3. Auth routes (signup, login, JWT middleware)
4. Interviews CRUD routes
5. Document upload routes + GCS/local storage + pdf-parse text extraction
6. Question generation service (Gemini Flash) + questions routes

### Phase 2: Meeting Bot
7. `meeting-bot/` project setup
8. `join.ts` — stripped Playwright join (no audio pipeline)
9. `captions.ts` — simplified caption scraping (no self-filter)
10. `bridge.ts` — orchestrator that POSTs to backend
11. `bot-manager.ts` in backend — spawn/kill bot process

### Phase 3: Real-time Features
12. Transcript routes (POST from bot, GET for frontend)
13. Milvus setup + embedding service
14. Suggestion service (RAG search + follow-up generation)
15. SSE endpoint for real-time suggestions

### Phase 4: Frontend
16. `frontend/` project setup (Vite, React, Tailwind, hash router)
17. Auth pages + AuthContext
18. Dashboard + interview list
19. Create interview page (with file upload + document picker)
20. Upcoming view (question bank, edit, generate more, join button)
21. In-progress view (live transcript + suggestions panel)
22. Completed view (report display + markdown export)

### Phase 5: Report Generation
23. Report generation service (Gemini Flash)
24. Report routes + completed view integration
25. Markdown export

---

## 5. Environment Variables

### Backend `.env`
```env
# Server
PORT=3000
JWT_SECRET=<random-secret>

# Postgres
DATABASE_URL=postgresql://user:password@localhost:5432/interview_assistant

# Milvus
MILVUS_ADDRESS=localhost:19530

# Google Cloud
GCS_BUCKET=interview-assistant-docs
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# AI
GEMINI_API_KEY=<key>

# Bot
BOT_PATH=../meeting-bot           # Path to meeting-bot directory
```

### Meeting Bot `.env`
```env
# Set by bot-manager when spawning, not manually configured
API_URL=http://localhost:3000
BOT_TOKEN=<short-lived-token>
```

### Frontend `.env`
```env
VITE_API_URL=http://localhost:3000
```

---

## 6. Local Development Setup

```bash
# Postgres (Docker)
docker run -d --name interview-pg -p 5432:5432 \
  -e POSTGRES_DB=interview_assistant \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  postgres:16

# Milvus (Docker)
docker run -d --name interview-milvus -p 19530:19530 \
  milvusdb/milvus:latest milvus run standalone

# Backend
cd backend && npm install && npm run dev

# Meeting bot (spawned by backend, but can test standalone)
cd meeting-bot && npm install
npm run bot -- --meeting <url> --interview-id <uuid> --api-url http://localhost:3000

# Frontend
cd frontend && npm install && npm run dev
```
