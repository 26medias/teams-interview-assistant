# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered interview assistant for Microsoft Teams. Upload a candidate's resume, hiring criteria, and job description, then the assistant joins a Teams call to provide real-time question suggestions and follow-ups. After the call, it generates a full evaluation report.

## Project Structure

```
docs/specs/        - Product specifications and implementation plans
prototype/         - Local-only prototype (TypeScript) — real-time transcription via SoX + Deepgram
candidate-agent/   - AI agent that joins Teams meetings and emulates a candidate (for testing)
meeting-bot/       - Playwright bridge: joins Teams, scrapes captions, POSTs to backend
backend/           - API server (Express, Postgres, Milvus, Gemini)
frontend/          - Web UI (React, Vite, Tailwind CSS, hash router)
```

## Architecture

```
Frontend (React SPA) ←→ Backend (Express API) ←→ Meeting Bot (Playwright)
                              ↕                         ↕
                     Postgres + Milvus          Teams Live Captions
                              ↕
                    Gemini 2.5 Flash (AI)
```

## Meeting Bot

Stripped-down Playwright bot that joins Teams as "Meeting Transcript Recorder", scrapes live captions from the DOM, and POSTs transcript segments to the backend. No audio, no mic, no camera.

```
meeting-bot/
└── src/
    ├── index.ts              # CLI: --meeting, --interview-id, --api-url, --token
    ├── bridge.ts             # Join → scrape → POST to backend
    ├── meeting/join.ts       # Playwright join (no audio pipeline)
    └── transcription/captions.ts  # Caption scraping (all speakers)
```

## Backend

Express + TypeScript server. Auth (JWT), interview CRUD, document upload + text extraction, question generation (Gemini), transcript ingestion from bot, real-time suggestion ranking (Milvus RAG + follow-up generation), SSE push, report generation.

```
backend/
└── src/
    ├── index.ts              # Express app
    ├── config.ts             # Environment variables
    ├── db/
    │   ├── postgres.ts       # pg pool
    │   ├── migrate.ts        # Run migrations
    │   └── migrations/001_initial.sql
    ├── middleware/
    │   ├── auth.ts           # JWT + bot token auth
    │   └── params.ts         # Route param helper
    ├── routes/               # auth, interviews, documents, questions, transcript, suggestions (SSE), report
    └── services/             # auth, interview, document, question-gen, embedding, suggestion, report, bot-manager
```

### Key APIs
- `POST /api/auth/signup`, `POST /api/auth/login` — JWT auth
- `POST /api/interviews`, `GET /api/interviews` — Interview CRUD
- `POST /api/interviews/:id/documents` — Upload resume/JD/criteria
- `POST /api/interviews/:id/questions/generate` — Generate questions (Gemini)
- `POST /api/interviews/:id/join` — Start meeting bot
- `POST /api/interviews/:id/transcript` — Receive transcript (from bot, x-bot-token auth)
- `GET /api/interviews/:id/suggestions` — SSE stream of real-time suggestions
- `POST /api/interviews/:id/leave` — Stop bot, trigger report generation
- `GET /api/interviews/:id/report` — Get evaluation report

### Database
Postgres tables: users, interviews, documents, interview_documents, questions, transcript_segments, reports.
Milvus collection: question_embeddings (for RAG-based question ranking during live interview).

## Frontend

React SPA with Vite, Tailwind CSS, hash router.

```
frontend/
└── src/
    ├── App.tsx               # Routes: /login, /signup, /, /interviews/new, /interviews/:id
    ├── api/client.ts         # Fetch wrapper with JWT, SSE helper
    ├── auth/                 # AuthContext, LoginPage, SignupPage
    ├── dashboard/            # DashboardPage, InterviewCard
    ├── interview/            # CreateInterviewPage, InterviewDetailPage, Upcoming/InProgress/CompletedView
    └── components/           # Layout, FileUpload, DocumentPicker, QuestionList, TranscriptPanel, SuggestionsPanel
```

## Candidate Agent

Test tool that joins Teams and emulates a candidate. Uses Teams live captions for listening (no audio capture), Gemini for responses, ElevenLabs v3 TTS with emotion audio tags for speech.

```
candidate-agent/
└── src/
    ├── index.ts              # CLI: --meeting, --resume, --name, --behavior, --tts, --verbose
    ├── orchestrator.ts       # State machine: LISTENING → THINKING → SPEAKING
    ├── meeting/join.ts       # Playwright join + Web Audio API injection
    ├── transcription/captions.ts  # Teams caption scraping with self-echo prevention
    └── ai/                   # resume-parser.ts, candidate-llm.ts (Gemini + emotion tags)
```

### Key Technical Decisions
- **Teams live captions** for transcription (not audio capture) — eliminates self-echo
- **Caption reset on speak→listen transition** — snapshots DOM text to ignore residual self-speech
- **Audio injection via addInitScript** — overrides getUserMedia/addTrack/replaceTrack with custom MediaStreamDestination
- **ElevenLabs v3 with audio tags** — `[nervous]`, `[excited]`, etc. for emotional delivery
- **ElevenLabs PCM format** — `output_format=pcm_16000` must be URL query param, not JSON body
- **Pipelined TTS** — sentences synthesized in parallel (max 2 concurrent), played in order
- **AudioContext at 48kHz** — matches WebRTC native rate; 16kHz TTS PCM resampled by browser

## Commands

```bash
# Backend
cd backend && npm run dev                    # Dev server on :3000
cd backend && npm run migrate                # Run DB migrations

# Meeting Bot (usually spawned by backend, but can test standalone)
cd meeting-bot && npm run bot -- --meeting <url> --interview-id <id> --api-url http://localhost:3000 --token <token>

# Frontend
cd frontend && npm run dev                   # Vite dev server on :5173

# Candidate Agent (for testing)
cd candidate-agent && npm run candidate -- --meeting <url> --resume <path.pdf> --name "Name" --behavior "description"
```

## Local Dev Setup

```bash
# Postgres (Docker on port 5433)
docker run -d --name interview-pg -p 5433:5432 -e POSTGRES_DB=interview_assistant -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password postgres:16

# Milvus (Docker)
docker run -d --name interview-milvus -p 19530:19530 milvusdb/milvus:latest milvus run standalone

# Run migrations
cd backend && npm run migrate
```

## Code Conventions

- 1 tab = 4 spaces
- Comment non-obvious code blocks
