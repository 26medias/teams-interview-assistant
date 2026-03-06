# Teams Interview Assistant

Concept:

You upload the candidate's resume, the hiring criterias & the job description, & details about the current stage (intro, deep dive, ...)
It generates a ton of questions in advance.
When the interview start, you add the plugin to Teams, and it'll listen to the call, and suggest questions & follow-up questions in real time based on what the candidate & interviewer say.

At the end of the call, it generates a full report: pros & cons, rating, recommendations for next step, ...

Project Architecture:
- doc/
    - specs/
- prototype/
- candidate-agent/
- backend/
- frontend/

Tech stack:
- Prototype
    - Typescript
    - Fully local
- candidate-agent
    - Typescript
    - Fully local
- Backend
    - Typescript
    - Postgres
    - Milvus for RAG
    - Document storage on Google Cloud Bucket (uploaded docs: resume, hiring criterias, ...)
- Frontend
    - React JS
    - Tailwindcss
    - Hash router

## prototype

Transcription validation: `npm run prototype --meeting {meeting_link}`
It joins the meeting link on Teams, and transcribes the audio in real time, with speaker name.
Transcription display on the terminal.
Runs entirely locally. Use ngrok if necessary.

## candidate-agent

An agent that emulates a candidate:
`npm run candidate --meeting {meeting_link} --resume path/to/resume.pdf --name="Lex Luthor"`

It joins a teams meeting, and uses TTS to emulate a candidate interviewing for a job.
This will allow to run tests.

## Frontend

- Auth gate
    - Sign-in
    - Sign-up
- Dashboard
    - [Create new interview]
        - Candidate name
        - Teams meeting link
        - Resume upload
        - "Job description" upload or select previously uploaded from past interviews
        - "Hiring criteria" upload or select previously uploaded from past interviews
        - Text input "Interview Stage details" (user enter if it's intro, deep dive, etc and what they're looking for: "I'm looking to validate their experience & knowledge of Agentic AI" for example) or select previously written from past interviews
    - List of interviews
        - Interview Details
            - If upcoming:
                - [Join meeting]
                - [Update meeting link]
                - List of generated questions (+ option to delete/manual edit/AI edit -> "feedback" -> new version)
                - [Generate more questions] -> "What type of questions, what should we focus on?"
                - Candidate summary (name, summary of experience, ...)
            - If in progress:
                - Candidate summary (name, summary of experience, ...)
                - Real-time transcripts
                - Next questions & follow up questions suggestions (5) with a "more" button
                - List of all generated questions
            - If completed:
                - Transcripts
                - Summary
                - Pros & cons
                - Rating
                - Recommended Decision / next steps
                - Export to markdown file
    

## Backend

Deployed to Google cloud function.
Runs locally for dev, using a local postgres & local milvus server.
Milvus is used for RAG to figure out the best questions to ask in context of the transcript.
The backend also generates follow up questions in real time in context of the transcript.


## Code rules
- 1 tab = 4 spaces
- Clean modular code
- Comment non-obvious code blocks
