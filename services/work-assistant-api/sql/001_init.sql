CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    checksum TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_type, external_id)
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    raw_storage_url TEXT,
    current_revision_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id)
);

CREATE TABLE IF NOT EXISTS document_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    checksum TEXT,
    extracted_text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    language TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_version INTEGER NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, processing_version)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_current_revision_id_fkey'
    ) THEN
        ALTER TABLE documents
        ADD CONSTRAINT documents_current_revision_id_fkey
        FOREIGN KEY (current_revision_id) REFERENCES document_revisions(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS document_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT,
    priority TEXT,
    confidence DOUBLE PRECISION,
    action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    entities JSONB NOT NULL DEFAULT '[]'::jsonb,
    deadlines JSONB NOT NULL DEFAULT '[]'::jsonb,
    open_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding VECTOR(1536),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (revision_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS tasks_mirror (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_task_id TEXT NOT NULL,
    external_project_id TEXT,
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    source_revision_id UUID REFERENCES document_revisions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_at TIMESTAMPTZ,
    priority INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (external_task_id)
);

CREATE INDEX IF NOT EXISTS document_revisions_document_id_idx
    ON document_revisions (document_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS document_analyses_revision_id_idx
    ON document_analyses (revision_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_chunks_revision_id_idx
    ON document_chunks (revision_id, chunk_index);

CREATE INDEX IF NOT EXISTS tasks_mirror_status_due_at_idx
    ON tasks_mirror (status, due_at);

CREATE INDEX IF NOT EXISTS documents_title_search_idx
    ON documents
    USING GIN (to_tsvector('simple', COALESCE(title, '')));

CREATE INDEX IF NOT EXISTS document_revisions_text_search_idx
    ON document_revisions
    USING GIN (to_tsvector('simple', COALESCE(extracted_text, '')));

CREATE INDEX IF NOT EXISTS tasks_mirror_search_idx
    ON tasks_mirror
    USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
    ON document_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
