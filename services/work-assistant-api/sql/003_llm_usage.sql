-- Track LLM token usage per call for quota monitoring
CREATE TABLE IF NOT EXISTS llm_usage_log (
    id          BIGSERIAL PRIMARY KEY,
    called_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model       TEXT        NOT NULL DEFAULT '',
    endpoint    TEXT        NOT NULL DEFAULT '',
    prompt_tokens      INTEGER NOT NULL DEFAULT 0,
    completion_tokens  INTEGER NOT NULL DEFAULT 0,
    total_tokens       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS llm_usage_log_called_at_idx ON llm_usage_log (called_at);
