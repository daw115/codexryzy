CREATE TABLE IF NOT EXISTS knowledge_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'analysis',
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (normalized_name, source)
);

CREATE TABLE IF NOT EXISTS document_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    revision_id UUID REFERENCES document_revisions(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES knowledge_topics(id) ON DELETE CASCADE,
    confidence DOUBLE PRECISION,
    origin TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrichment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    topic_id UUID REFERENCES knowledge_topics(id) ON DELETE SET NULL,
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    source_revision_id UUID REFERENCES document_revisions(id) ON DELETE SET NULL,
    query_text TEXT,
    search_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
    allow_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
    freshness_days INTEGER,
    max_results INTEGER NOT NULL DEFAULT 10,
    notes TEXT,
    result_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_topics_normalized_name_idx
    ON knowledge_topics (normalized_name);

CREATE INDEX IF NOT EXISTS document_topics_document_id_idx
    ON document_topics (document_id, topic_id);

CREATE INDEX IF NOT EXISTS document_topics_revision_id_idx
    ON document_topics (revision_id, topic_id);

CREATE INDEX IF NOT EXISTS enrichment_jobs_status_idx
    ON enrichment_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS enrichment_jobs_topic_id_idx
    ON enrichment_jobs (topic_id, created_at DESC);
