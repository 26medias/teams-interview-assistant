CREATE TABLE IF NOT EXISTS criteria_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    evidence TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_criteria_interview_id ON criteria_items(interview_id);
