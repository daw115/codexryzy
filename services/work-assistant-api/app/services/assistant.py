from __future__ import annotations

from psycopg_pool import AsyncConnectionPool

from app.clients.chat_completions import ChatCompletionsClient, CompletionResult
from app.clients.embeddings import EmbeddingClient
from app.schemas import (
    AssistantCitation,
    AssistantQueryRequest,
    AssistantQueryResponse,
    LlmUsageLogRequest,
    SearchRequest,
)
from app.services.search import search_knowledge_base
from app.services.usage import record_llm_usage


async def answer_query(
    *,
    pool: AsyncConnectionPool,
    payload: AssistantQueryRequest,
    embedding_client: EmbeddingClient,
    chat_client: ChatCompletionsClient,
) -> AssistantQueryResponse:
    if not chat_client.enabled:
        raise RuntimeError("LLM_API_URL, LLM_API_KEY and LLM_MODEL must be configured")

    search_query = payload.query
    search_result = await _search_with_optional_embedding(
        pool=pool,
        embedding_client=embedding_client,
        query=search_query,
        limit=payload.search_limit,
        include_tasks=payload.include_tasks,
    )

    if not search_result.documents and not search_result.tasks:
        rewrite_result = await _rewrite_query_for_retrieval(
            chat_client=chat_client,
            original_query=payload.query,
        )
        rewritten_query = rewrite_result.text if rewrite_result else None
        if rewrite_result:
            await _log_usage(pool=pool, result=rewrite_result, endpoint="query_rewrite")
        if rewritten_query and rewritten_query != search_query:
            search_query = rewritten_query
            search_result = await _search_with_optional_embedding(
                pool=pool,
                embedding_client=embedding_client,
                query=search_query,
                limit=payload.search_limit,
                include_tasks=payload.include_tasks,
            )

    documents = search_result.documents[: payload.max_document_contexts]
    tasks = search_result.tasks[: payload.max_task_contexts]

    document_contexts = await _load_document_contexts(pool=pool, document_ids=[item.document_id for item in documents])
    citations = _build_citations(documents=documents, tasks=tasks, document_contexts=document_contexts)

    system_prompt = (
        "You are a work assistant operating on top of a verified company knowledge base. "
        "Answer only from the provided context. "
        "If the context is insufficient, say what is missing. "
        "Use inline citations exactly in the form [DOC-1], [DOC-2], [TASK-1], etc. "
        "Do not invent deadlines, commitments, statuses or people."
    )
    user_prompt = _build_user_prompt(
        query=payload.query,
        documents=documents,
        tasks=tasks,
        document_contexts=document_contexts,
    )
    answer_result = await chat_client.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.1,
        max_tokens=1400,
    )
    await _log_usage(pool=pool, result=answer_result, endpoint="assistant")

    return AssistantQueryResponse(
        query=payload.query,
        answer=answer_result.text,
        citations=citations,
        documents=search_result.documents,
        tasks=search_result.tasks,
    )


async def _log_usage(
    *,
    pool: AsyncConnectionPool,
    result: CompletionResult,
    endpoint: str,
) -> None:
    try:
        await record_llm_usage(
            pool=pool,
            payload=LlmUsageLogRequest(
                model=result.model,
                endpoint=endpoint,
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
            ),
        )
    except Exception:
        pass  # usage logging is best-effort, never break the main flow


async def _load_document_contexts(
    *,
    pool: AsyncConnectionPool,
    document_ids: list[str],
) -> dict[str, dict[str, str | None]]:
    if not document_ids:
        return {}

    contexts: dict[str, dict[str, str | None]] = {}
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            for document_id in document_ids:
                await cursor.execute(
                    """
                    WITH latest_analysis AS (
                        SELECT DISTINCT ON (revision_id)
                            revision_id,
                            summary,
                            category,
                            priority
                        FROM document_analyses
                        ORDER BY revision_id, created_at DESC
                    )
                    SELECT
                        d.id::text AS document_id,
                        d.title,
                        d.raw_storage_url,
                        r.extracted_text,
                        a.summary,
                        a.category,
                        a.priority
                    FROM documents d
                    JOIN document_revisions r ON r.id = d.current_revision_id
                    LEFT JOIN latest_analysis a ON a.revision_id = r.id
                    WHERE d.id = %s::uuid
                    """,
                    (document_id,),
                )
                row = await cursor.fetchone()
                if not row:
                    continue
                contexts[document_id] = {
                    "title": row["title"],
                    "raw_storage_url": row["raw_storage_url"],
                    "summary": row["summary"],
                    "category": row["category"],
                    "priority": row["priority"],
                    "extracted_text": (row["extracted_text"] or "")[:3000],
                }
    return contexts


def _build_citations(*, documents, tasks, document_contexts) -> list[AssistantCitation]:
    citations: list[AssistantCitation] = []
    for index, document in enumerate(documents, start=1):
        context = document_contexts.get(document.document_id, {})
        citations.append(
            AssistantCitation(
                source_type="document",
                source_id=document.document_id,
                label=f"DOC-{index}",
                title=document.title,
                score=document.score,
                excerpt=document.excerpt or context.get("summary"),
                url=context.get("raw_storage_url"),
            )
        )
    for index, task in enumerate(tasks, start=1):
        citations.append(
            AssistantCitation(
                source_type="task",
                source_id=task.external_task_id,
                label=f"TASK-{index}",
                title=task.title,
                score=task.score,
                excerpt=f"status={task.status}" + (
                    f", due_at={task.due_at.isoformat()}" if task.due_at else ""
                ),
                url=None,
            )
        )
    return citations


def _build_user_prompt(
    *,
    query: str,
    documents,
    tasks,
    document_contexts,
) -> str:
    lines = [
        f"User question: {query}",
        "",
        "Documents:",
    ]

    if not documents:
        lines.append("(no matching documents)")

    for index, document in enumerate(documents, start=1):
        context = document_contexts.get(document.document_id, {})
        lines.extend(
            [
                f"[DOC-{index}] {document.title}",
                f"Score: {document.score:.4f}",
                f"Category: {document.category or context.get('category') or '(unknown)'}",
                f"Priority: {document.priority or context.get('priority') or '(unknown)'}",
                f"Summary: {document.summary or context.get('summary') or '(none)'}",
                f"Excerpt: {document.excerpt or '(none)'}",
                "Content:",
                context.get("extracted_text") or "(no content)",
                "",
            ]
        )

    lines.append("Tasks:")
    if not tasks:
        lines.append("(no matching tasks)")

    for index, task in enumerate(tasks, start=1):
        lines.extend(
            [
                f"[TASK-{index}] {task.title}",
                f"Status: {task.status}",
                f"Priority: {task.priority if task.priority is not None else '(unknown)'}",
                f"Due at: {task.due_at.isoformat() if task.due_at else '(none)'}",
                "",
            ]
        )

    lines.append(
        "Answer the user in concise Polish unless the question clearly requires another language."
    )
    return "\n".join(lines)


async def _search_with_optional_embedding(
    *,
    pool: AsyncConnectionPool,
    embedding_client: EmbeddingClient,
    query: str,
    limit: int,
    include_tasks: bool,
):
    query_embedding = await embedding_client.embed_text(query)
    return await search_knowledge_base(
        pool=pool,
        payload=SearchRequest(
            query=query,
            limit=limit,
            include_tasks=include_tasks,
        ),
        query_embedding=query_embedding,
    )


async def _rewrite_query_for_retrieval(
    *,
    chat_client: ChatCompletionsClient,
    original_query: str,
) -> CompletionResult | None:
    result = await chat_client.complete(
        system_prompt=(
            "You convert a natural-language user question into a short retrieval query for a lexical search index. "
            "Return only one line of plain text. "
            "Keep the original language. "
            "Prefer concrete nouns, names, subjects, dates and project terms. "
            "Do not explain anything."
        ),
        user_prompt=(
            "Rewrite this user question into a compact search phrase with the most distinctive keywords.\n\n"
            f"Question: {original_query}"
        ),
        temperature=0.0,
        max_tokens=80,
    )
    rewritten = " ".join(result.text.split())
    if not rewritten:
        return None
    return CompletionResult(
        text=rewritten[:240],
        model=result.model,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        total_tokens=result.total_tokens,
    )
