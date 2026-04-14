#!/usr/bin/env python3
"""
Analyze all existing emails in the database that haven't been analyzed yet.
This script:
1. Fetches unanalyzed emails from PostgreSQL
2. Sends them to LLM for analysis (category, priority, tasks, summary)
3. Saves analysis results back to database
4. Creates embeddings for semantic search
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Any, Optional

import asyncpg
import httpx


# Configuration from environment
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
DB_NAME = os.getenv("POSTGRES_DB", "work_assistant")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

LLM_API_URL = os.getenv("LLM_API_URL", "https://api.quatarly.cloud/v0")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-6")

EMBEDDING_API_URL = os.getenv("EMBEDDING_API_URL", "")
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

BATCH_SIZE = int(os.getenv("BATCH_SIZE", "10"))
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT", "3"))


ANALYSIS_SYSTEM_PROMPT = """You are an email analysis assistant. Analyze the email and extract:

1. **Category**: Choose ONE from: project_update, client_communication, internal_discussion, task_assignment, meeting_coordination, technical_issue, administrative, other
2. **Priority**: Choose ONE from: high, medium, low
3. **Summary**: 1-2 sentence summary of the email
4. **Key Points**: List of 3-5 key points or takeaways
5. **Action Items**: List of tasks/actions mentioned with project and area assignment
6. **People Mentioned**: List of people mentioned by name
7. **Deadlines**: Any dates or deadlines mentioned
8. **Projects**: Project names or codes mentioned (e.g., "Project Alpha", "PROJ-123", "Client XYZ")
9. **Areas**: Technical/business areas mentioned (e.g., "backend", "frontend", "infrastructure", "marketing", "sales", "operations")

For each action item, assign:
- **project**: Which project this task belongs to (from Projects list, or "general" if none)
- **area**: Which area/domain (e.g., "backend", "frontend", "devops", "design", "business", "admin")
- **tags**: Additional tags for categorization (e.g., ["urgent", "bug", "feature", "documentation"])

Return ONLY valid JSON with this structure:
{
  "category": "string",
  "priority": "string",
  "summary": "string",
  "key_points": ["string"],
  "action_items": [
    {
      "title": "string",
      "description": "string",
      "due_date": "YYYY-MM-DD or null",
      "project": "string",
      "area": "string",
      "tags": ["string"]
    }
  ],
  "people": ["string"],
  "deadlines": ["YYYY-MM-DD"],
  "projects": ["string"],
  "areas": ["string"]
}"""


async def get_db_connection():
    """Create database connection."""
    return await asyncpg.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


async def fetch_unanalyzed_emails(conn, limit: int = 100):
    """Fetch emails that haven't been analyzed yet."""
    query = """
    SELECT
        d.id::text as document_id,
        d.title,
        r.id::text as revision_id,
        r.extracted_text,
        d.metadata
    FROM documents d
    JOIN document_revisions r ON r.id = d.current_revision_id
    LEFT JOIN document_analyses da ON da.revision_id = r.id
    WHERE d.metadata->>'artifact_type' = 'email'
      AND da.id IS NULL
    ORDER BY d.created_at DESC
    LIMIT $1
    """
    rows = await conn.fetch(query, limit)
    return [dict(row) for row in rows]


async def analyze_email_with_llm(email: dict) -> Optional[dict]:
    """Send email to LLM for analysis."""
    if not LLM_API_KEY:
        print("⚠️  LLM_API_KEY not set, skipping LLM analysis")
        return None

    user_prompt = f"""Email Title: {email['title']}

Email Content:
{email['extracted_text'][:4000]}

Analyze this email and return the JSON structure."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{LLM_API_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 1500,
                },
            )
            response.raise_for_status()
            data = response.json()

            content = data["choices"][0]["message"]["content"]
            # Try to extract JSON from markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            analysis = json.loads(content)
            return analysis

    except Exception as e:
        print(f"❌ LLM analysis failed for {email['document_id']}: {e}")
        return None


async def create_embedding(text: str) -> Optional[list]:
    """Create embedding for text."""
    if not EMBEDDING_API_KEY or not EMBEDDING_API_URL:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{EMBEDDING_API_URL}/embeddings",
                headers={
                    "Authorization": f"Bearer {EMBEDDING_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": EMBEDDING_MODEL,
                    "input": text[:8000],  # Limit text length
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]

    except Exception as e:
        print(f"⚠️  Embedding creation failed: {e}")
        return None


async def save_analysis(conn, email: dict[str, Any], analysis: dict[str, Any]):
    """Save analysis results to database."""
    try:
        # Insert document analysis
        await conn.execute(
            """
            INSERT INTO document_analyses (
                revision_id,
                model,
                prompt_version,
                summary,
                category,
                priority,
                metadata,
                created_at
            )
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW())
            """,
            email["revision_id"],
            LLM_MODEL,
            "v1",
            analysis.get("summary", ""),
            analysis.get("category", "other"),
            analysis.get("priority", "medium"),
            json.dumps({
                "key_points": analysis.get("key_points", []),
                "people": analysis.get("people", []),
                "deadlines": analysis.get("deadlines", []),
                "projects": analysis.get("projects", []),
            }),
        )

        # Insert action items as tasks with project and area categorization
        for item in analysis.get("action_items", []):
            await conn.execute(
                """
                INSERT INTO tasks_mirror (
                    external_task_id,
                    external_project_id,
                    source_document_id,
                    source_revision_id,
                    title,
                    description,
                    due_at,
                    priority,
                    status,
                    metadata,
                    created_at
                )
                VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, 'open', $9, NOW())
                """,
                f"llm_analysis_{email['document_id']}_{item.get('title', '')[:50]}",
                item.get("project", "general"),
                email["document_id"],
                email["revision_id"],
                item.get("title", ""),
                item.get("description", ""),
                item.get("due_date"),
                1 if analysis.get("priority") == "high" else 2 if analysis.get("priority") == "medium" else 3,
                json.dumps({
                    "source": "llm_analysis",
                    "area": item.get("area", "general"),
                    "tags": item.get("tags", []),
                }),
            )

        print(f"✅ Saved analysis for {email['title'][:50]}...")

    except Exception as e:
        print(f"❌ Failed to save analysis for {email['document_id']}: {e}")


async def create_embeddings_for_email(conn, email: dict[str, Any], analysis: dict[str, Any]):
    """Create and save embeddings for email."""
    # Combine title, summary, and key points for embedding
    text_for_embedding = f"{email['title']}\n\n{analysis.get('summary', '')}\n\n"
    text_for_embedding += "\n".join(analysis.get('key_points', []))

    embedding = await create_embedding(text_for_embedding)
    if not embedding:
        return

    try:
        # Save embedding to document_chunks table
        await conn.execute(
            """
            INSERT INTO document_chunks (
                revision_id,
                chunk_index,
                content,
                embedding,
                metadata,
                created_at
            )
            VALUES ($1::uuid, 0, $2, $3, $4, NOW())
            ON CONFLICT (revision_id, chunk_index)
            DO UPDATE SET
                content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata
            """,
            email["revision_id"],
            text_for_embedding[:2000],
            embedding,
            json.dumps({"type": "summary_embedding"}),
        )
        print(f"✅ Created embedding for {email['title'][:50]}...")

    except Exception as e:
        print(f"❌ Failed to create embedding for {email['document_id']}: {e}")


async def process_email(conn, email: dict[str, Any], semaphore):
    """Process a single email: analyze and create embeddings."""
    async with semaphore:
        print(f"📧 Processing: {email['title'][:60]}...")

        # Analyze with LLM
        analysis = await analyze_email_with_llm(email)
        if not analysis:
            print(f"⚠️  Skipping {email['title'][:50]}... (no analysis)")
            return

        # Save analysis
        await save_analysis(conn, email, analysis)

        # Create embeddings
        await create_embeddings_for_email(conn, email, analysis)


async def main():
    """Main execution function."""
    print("🚀 Starting email analysis backfill...")
    print(f"   Database: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    print(f"   LLM: {LLM_MODEL}")
    print(f"   Batch size: {BATCH_SIZE}")
    print(f"   Max concurrent: {MAX_CONCURRENT}")
    print()

    if not LLM_API_KEY:
        print("❌ LLM_API_KEY not set. Please set it in environment.")
        sys.exit(1)

    conn = await get_db_connection()
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    try:
        total_processed = 0

        while True:
            # Fetch batch of unanalyzed emails
            emails = await fetch_unanalyzed_emails(conn, BATCH_SIZE)

            if not emails:
                print("\n✅ No more emails to analyze!")
                break

            print(f"\n📦 Processing batch of {len(emails)} emails...")

            # Process emails concurrently
            tasks = [process_email(conn, email, semaphore) for email in emails]
            await asyncio.gather(*tasks, return_exceptions=True)

            total_processed += len(emails)
            print(f"\n📊 Progress: {total_processed} emails analyzed")

            # Small delay between batches
            await asyncio.sleep(1)

        print(f"\n🎉 Analysis complete! Total emails processed: {total_processed}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
