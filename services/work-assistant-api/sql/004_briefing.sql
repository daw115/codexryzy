-- Daily AI briefing cache — one row per calendar day
CREATE TABLE IF NOT EXISTS daily_briefings (
    id          BIGSERIAL PRIMARY KEY,
    briefing_date DATE NOT NULL UNIQUE,
    content     TEXT NOT NULL,
    model       TEXT NOT NULL DEFAULT '',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
