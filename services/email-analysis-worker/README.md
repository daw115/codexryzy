# Email Analysis Worker

Railway worker service that analyzes emails in the database and extracts:
- Category, priority, summary
- Key points, action items, people mentioned
- Deadlines, projects, areas
- Creates embeddings for semantic search

## Environment Variables

Required:
- `POSTGRES_HOST` - Database host (use Railway internal: `pgvector.railway.internal`)
- `POSTGRES_PORT` - Database port (default: `5432`)
- `POSTGRES_DB` - Database name (default: `railway`)
- `POSTGRES_USER` - Database user (default: `postgres`)
- `POSTGRES_PASSWORD` - Database password
- `LLM_API_KEY` - Quatarly API key for Claude

Optional:
- `LLM_MODEL` - LLM model to use (default: `claude-sonnet-4-6`)
- `BATCH_SIZE` - Number of emails to process per batch (default: `10`)
- `MAX_CONCURRENT` - Max concurrent LLM requests (default: `3`)
- `EMBEDDING_API_URL` - OpenAI-compatible embeddings API URL
- `EMBEDDING_API_KEY` - Embeddings API key
- `EMBEDDING_MODEL` - Embedding model (default: `text-embedding-3-small`)

## Deployment

1. Create new service in Railway
2. Connect to this directory: `services/email-analysis-worker`
3. Set environment variables (use Railway references for database)
4. Deploy

The worker will run once and exit when complete.
