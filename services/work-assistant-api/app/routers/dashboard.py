from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.security import require_api_key
from app.services.coverage import get_llm_usage_summary, get_mail_coverage

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_class=HTMLResponse, dependencies=[Depends(require_api_key)])
async def dashboard(
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> HTMLResponse:
    import asyncio

    settings = request.app.state.settings
    quota = getattr(settings, "llm_monthly_token_quota", None)

    coverage, llm, tasks, recent_docs = await asyncio.gather(
        get_mail_coverage(pool=db_pool, day_limit=365, document_limit=0),
        get_llm_usage_summary(pool=db_pool, quota_monthly_tokens=quota),
        _load_open_tasks(db_pool),
        _load_recent_documents(db_pool),
    )

    # ── tasks section ──────────────────────────────────────────────────────
    task_rows = ""
    for t in tasks[:30]:
        due = t["due_at"].strftime("%d.%m.%Y") if t["due_at"] else "—"
        pri = {1: "🔴 pilne", 2: "🟠 wysoki", 3: "🟡 normalny", 4: "🟢 niski"}.get(t["priority"] or 3, "—")
        overdue = t["due_at"] and t["due_at"].date() < __import__("datetime").date.today()
        row_cls = ' style="background:#2a1a1a"' if overdue else ""
        task_rows += f"<tr{row_cls}><td>{_esc(t['title'])}</td><td>{due}</td><td>{pri}</td><td>{_esc(t['project_id'] or '')}</td></tr>\n"
    if not task_rows:
        task_rows = "<tr><td colspan='4' style='color:#64748b'>Brak otwartych zadań</td></tr>"

    # ── recent docs section ────────────────────────────────────────────────
    doc_rows = ""
    for d in recent_docs:
        date_str = d["message_day"] or (d["created_at"].strftime("%Y-%m-%d") if d["created_at"] else "—")
        summary = (d["summary"] or "").replace("\n", " ")[:120]
        cat = d["category"] or ""
        pri_color = {"urgent": "#f87171", "high": "#fb923c", "normal": "#60a5fa", "low": "#34d399"}.get(
            (d["priority"] or "normal").lower(), "#60a5fa"
        )
        title_esc = _esc(d["title"])
        title_short = _esc(d["title"][:60])
        doc_rows += (
            f"<tr>"
            f"<td>{date_str}</td>"
            f"<td style='max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='{title_esc}'"
            f">{title_short}</td>"
            f"<td><span style='color:{pri_color}'>{_esc(cat)}</span></td>"
            f"<td style='color:#94a3b8;font-size:.8rem'>{_esc(summary)}</td>"
            f"</tr>\n"
        )
    if not doc_rows:
        doc_rows = "<tr><td colspan='4' style='color:#64748b'>Brak dokumentów</td></tr>"

    # ── calendar / coverage ────────────────────────────────────────────────
    days_rows = ""
    for day in coverage.days[:30]:
        days_rows += f"<tr><td>{day.day}</td><td>{day.count}</td></tr>\n"

    # ── quota bar ──────────────────────────────────────────────────────────
    quota_html = ""
    if llm.quota_monthly_tokens:
        used = llm.quota_monthly_tokens - (llm.quota_remaining_tokens or 0)
        pct = 100 * used / llm.quota_monthly_tokens
        quota_html = f"""
        <div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:#94a3b8;margin-bottom:.4rem">
            <span>Quota miesięczna Quatarly</span>
            <span>{_fmt(used)} / {_fmt(llm.quota_monthly_tokens)} &mdash; pozostało <strong style="color:#a5b4fc">{_fmt(llm.quota_remaining_tokens or 0)}</strong></span>
          </div>
          <div class="pb-bg"><div class="pb-fill" style="width:{min(pct,100):.1f}%"></div></div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="60">
<title>OjeAI</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f1117;color:#e2e8f0;padding:1.5rem 2rem}}
h1{{font-size:1.5rem;font-weight:700;margin-bottom:1.25rem;color:#fff;display:flex;align-items:center;gap:.6rem}}
h2{{font-size:.8rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.9rem}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem;margin-bottom:1.25rem}}
.card{{background:#1e2130;border:1px solid #2d3148;border-radius:12px;padding:1.25rem}}
.stat{{font-size:2.2rem;font-weight:700;color:#818cf8}}
.stat-sub{{font-size:.82rem;color:#64748b;margin-top:.2rem}}
.badge{{display:inline-block;background:#1e3a5f;color:#7dd3fc;font-size:.72rem;padding:.15rem .5rem;border-radius:999px;margin-top:.4rem}}
.section{{background:#1e2130;border:1px solid #2d3148;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem}}
table{{width:100%;border-collapse:collapse;font-size:.82rem}}
thead th{{color:#64748b;text-align:left;padding:.4rem .6rem;border-bottom:1px solid #2d3148;font-weight:500}}
tbody tr:hover{{background:#252840}}
tbody td{{padding:.45rem .6rem;border-bottom:1px solid #1e2130;vertical-align:middle}}
.pb-bg{{background:#2d3148;border-radius:999px;height:8px}}
.pb-fill{{background:linear-gradient(90deg,#6366f1,#a78bfa);border-radius:999px;height:8px}}
footer{{margin-top:1.5rem;color:#475569;font-size:.78rem}}
a{{color:#6366f1;text-decoration:none}}
</style>
</head>
<body>

<h1>🧠 OjeAI Dashboard</h1>

<!-- STATS ROW -->
<div class="grid">
  <div class="card">
    <h2>Baza wiedzy</h2>
    <div class="stat">{coverage.total_email_documents}</div>
    <div class="stat-sub">maili w bazie</div>
    <span class="badge">{coverage.covered_days_count} dni pokrytych</span>
  </div>
  <div class="card">
    <h2>Zakres dat</h2>
    <div style="font-size:1rem;color:#818cf8;font-weight:600">{coverage.earliest_message_day or "—"}</div>
    <div class="stat-sub">najstarszy mail</div>
    <div style="font-size:1rem;color:#a78bfa;font-weight:600;margin-top:.5rem">{coverage.latest_message_day or "—"}</div>
    <div class="stat-sub">najnowszy mail</div>
  </div>
  <div class="card">
    <h2>Tokeny — dziś</h2>
    <div class="stat">{_fmt(llm.today.total_tokens)}</div>
    <div class="stat-sub">{llm.today.calls} wywołań asystenta</div>
    <span class="badge">ten miesiąc: {_fmt(llm.this_month.total_tokens)}</span>
  </div>
  <div class="card">
    <h2>Otwarte zadania</h2>
    <div class="stat">{len(tasks)}</div>
    <div class="stat-sub">z Vikunja</div>
    <span class="badge">zsynchronizowane lokalnie</span>
  </div>
</div>

{quota_html}

<!-- TASKS -->
<div class="section">
  <h2>Otwarte zadania</h2>
  <table>
    <thead><tr><th>Tytuł</th><th>Termin</th><th>Priorytet</th><th>Projekt</th></tr></thead>
    <tbody>{task_rows}</tbody>
  </table>
</div>

<!-- RECENT MAILS -->
<div class="section">
  <h2>Ostatnio wgrane maile (analiza Claude)</h2>
  <table>
    <thead><tr><th>Data</th><th>Temat</th><th>Kategoria</th><th>Streszczenie</th></tr></thead>
    <tbody>{doc_rows}</tbody>
  </table>
</div>

<!-- COVERAGE CALENDAR -->
<div class="section">
  <h2>Pokrycie dni (ostatnie 30 dni z mailami)</h2>
  <table>
    <thead><tr><th>Dzień</th><th>Liczba maili</th></tr></thead>
    <tbody>{days_rows if days_rows else "<tr><td colspan='2' style='color:#64748b'>Brak danych</td></tr>"}</tbody>
  </table>
</div>

<footer>
  Auto-odświeżanie co 60&thinsp;s &bull; {settings.app_env} &bull;
  <a href="/v1/coverage/status">JSON status</a> &bull;
  <a href="/docs">API docs</a>
</footer>

</body>
</html>
"""
    return HTMLResponse(content=html)


async def _load_open_tasks(pool: AsyncConnectionPool) -> list[dict]:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT title, due_at, priority, external_project_id AS project_id
                FROM tasks_mirror
                WHERE status = 'open'
                ORDER BY
                    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
                    due_at ASC,
                    priority ASC NULLS LAST
                LIMIT 50
                """
            )
            return [dict(r) for r in await cur.fetchall()]


async def _load_recent_documents(pool: AsyncConnectionPool) -> list[dict]:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT
                    d.title,
                    d.created_at,
                    COALESCE(d.metadata->>'message_date_day', r.metadata->>'message_date_day') AS message_day,
                    a.summary,
                    a.category,
                    a.priority
                FROM documents d
                LEFT JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN LATERAL (
                    SELECT summary, category, priority
                    FROM document_analyses
                    WHERE revision_id = r.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) a ON true
                WHERE COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'email'
                ORDER BY d.created_at DESC
                LIMIT 25
                """
            )
            return [dict(r) for r in await cur.fetchall()]


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _fmt(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(n)
