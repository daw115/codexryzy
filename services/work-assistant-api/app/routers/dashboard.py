from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import DashboardOverviewResponse
from app.security import require_api_key
from app.services.coverage import get_llm_usage_summary, get_mail_coverage
from app.services.dashboard import get_dashboard_overview, load_open_tasks, load_recent_documents

router = APIRouter(tags=["dashboard"])


@router.get(
    "/v1/dashboard/overview",
    response_model=DashboardOverviewResponse,
    dependencies=[Depends(require_api_key)],
)
async def dashboard_overview(
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> DashboardOverviewResponse:
    import asyncio

    settings = request.app.state.settings
    quota = getattr(settings, "llm_monthly_token_quota", None)
    coverage, llm = await asyncio.gather(
        get_mail_coverage(pool=db_pool, day_limit=365, document_limit=25),
        get_llm_usage_summary(pool=db_pool, quota_monthly_tokens=quota),
    )
    return await get_dashboard_overview(
        pool=db_pool,
        environment=settings.app_env,
        mail_coverage=coverage,
        llm_usage=llm,
    )




@router.get(
    "/v1/dashboard/weekly-summary",
    dependencies=[Depends(require_api_key)],
)
async def weekly_summary(
    week: str = Query(..., description="Week in format YYYY-Www (e.g., 2026-W15)"),
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
):
    """Get weekly summary with tasks, emails, and insights."""
    try:
        # Parse week string (format: 2026-W15)
        year, week_num = week.split("-W")
        year = int(year)
        week_num = int(week_num)

        # Calculate date range for the week
        jan_4 = datetime(year, 1, 4)
        week_start = jan_4 - timedelta(days=jan_4.weekday()) + timedelta(weeks=week_num - 1)
        week_end = week_start + timedelta(days=6)

        async with db_pool.connection() as conn:
            # Get tasks due this week
            tasks_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.description,
                    t.due_at, t.priority, t.status, t.metadata,
                    t.created_at, t.updated_at
                FROM tasks_mirror t
                WHERE t.status = 'open'
                  AND t.due_at BETWEEN %s AND %s
                ORDER BY t.priority, t.due_at
                """,
                [week_start, week_end + timedelta(days=1)],
            )
            tasks_due = [dict(row) for row in await tasks_result.fetchall()]

            # Get high priority tasks
            high_priority_count = sum(1 for t in tasks_due if t["priority"] == 1)

            # Get urgent tasks (next 48h)
            now = datetime.now()
            urgent_deadline = now + timedelta(hours=48)
            urgent_tasks = [
                t for t in tasks_due
                if t["due_at"] and t["due_at"] <= urgent_deadline
            ]

            # Get emails analyzed this week
            emails_result = await conn.execute(
                """
                SELECT COUNT(*) as count
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                WHERE s.source_type = 'google_drive_mail'
                  AND d.created_at BETWEEN %s AND %s
                """,
                [week_start, week_end + timedelta(days=1)],
            )
            emails_analyzed = (await emails_result.fetchone())['count']

            # Get active projects
            projects_result = await conn.execute(
                """
                SELECT COUNT(DISTINCT t.metadata->>'project') as count
                FROM tasks_mirror t
                WHERE t.updated_at BETWEEN %s AND %s
                  AND t.metadata->>'project' IS NOT NULL
                """,
                [week_start, week_end + timedelta(days=1)],
            )
            active_projects = (await projects_result.fetchone())['count']

            # Get urgent deadlines
            urgent_deadlines = sum(
                1 for t in tasks_due
                if t["priority"] == 1 and t["due_at"]
            )

            # Get next week preview
            next_week_start = week_end + timedelta(days=1)
            next_week_end = next_week_start + timedelta(days=7)
            next_week_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.description,
                    t.due_at, t.priority, t.status, t.metadata,
                    t.created_at, t.updated_at
                FROM tasks_mirror t
                WHERE t.status = 'open'
                  AND t.due_at BETWEEN %s AND %s
                ORDER BY t.priority, t.due_at
                LIMIT 5
                """,
                [next_week_start, next_week_end],
            )
            next_week_preview = [dict(row) for row in await next_week_result.fetchall()]

            # Generate insights
            insights = []
            if emails_analyzed > 0:
                insights.append(f"📧 {emails_analyzed} new emails analyzed this week")
            if high_priority_count > 0:
                insights.append(f"⚠️ {high_priority_count} high priority tasks require attention")
            if active_projects > 0:
                insights.append(f"📊 {active_projects} projects with activity this week")

            return {
                "week": week,
                "date_range": {
                    "start": week_start.strftime("%Y-%m-%d"),
                    "end": week_end.strftime("%Y-%m-%d"),
                },
                "stats": {
                    "tasks_due": len(tasks_due),
                    "tasks_high_priority": high_priority_count,
                    "emails_analyzed": emails_analyzed,
                    "active_projects": active_projects,
                    "urgent_deadlines": urgent_deadlines,
                },
                "urgent_tasks": urgent_tasks,
                "next_week_preview": next_week_preview,
                "insights": insights,
            }

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week format. Use YYYY-Www (e.g., 2026-W15)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/v1/dashboard/daily-report",
    dependencies=[Depends(require_api_key)],
)
async def daily_report(
    date: str = Query(..., description="Date in format YYYY-MM-DD (e.g., 2026-04-15)"),
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
):
    """Get daily report with emails, tasks, and upcoming items."""
    try:
        # Parse date string
        report_date = datetime.strptime(date, "%Y-%m-%d").date()
        day_start = datetime.combine(report_date, datetime.min.time())
        day_end = datetime.combine(report_date, datetime.max.time())

        async with db_pool.connection() as conn:
            # Get emails for this day
            emails_result = await conn.execute(
                """
                SELECT
                    d.id, d.title, d.category,
                    d.metadata->>'message_day' as message_day,
                    d.created_at
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                WHERE s.source_type = 'google_drive_mail'
                  AND d.metadata->>'message_day' = %s
                ORDER BY d.created_at DESC
                LIMIT 50
                """,
                [date],
            )
            emails = [dict(row) for row in await emails_result.fetchall()]

            # Count emails by category
            emails_by_category = {}
            for email in emails:
                cat = email.get("category") or "uncategorized"
                emails_by_category[cat] = emails_by_category.get(cat, 0) + 1

            # Get tasks completed today
            completed_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.priority
                FROM tasks_mirror t
                WHERE t.status = 'done'
                  AND t.updated_at BETWEEN %s AND %s
                ORDER BY t.updated_at DESC
                LIMIT 20
                """,
                [day_start, day_end],
            )
            tasks_completed = [dict(row) for row in await completed_result.fetchall()]

            # Get tasks in progress
            in_progress_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.priority, t.due_at
                FROM tasks_mirror t
                WHERE t.status = 'open'
                  AND t.updated_at BETWEEN %s AND %s
                ORDER BY t.priority, t.due_at
                LIMIT 20
                """,
                [day_start, day_end],
            )
            tasks_in_progress = [dict(row) for row in await in_progress_result.fetchall()]

            # Get overdue tasks
            overdue_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.priority, t.due_at
                FROM tasks_mirror t
                WHERE t.status = 'open'
                  AND t.due_at < %s
                ORDER BY t.due_at
                LIMIT 10
                """,
                [day_start],
            )
            tasks_overdue = [dict(row) for row in await overdue_result.fetchall()]

            # Get upcoming tasks (next 3 days)
            next_3_days = day_end + timedelta(days=3)
            upcoming_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.priority, t.due_at
                FROM tasks_mirror t
                WHERE t.status = 'open'
                  AND t.due_at BETWEEN %s AND %s
                ORDER BY t.due_at, t.priority
                LIMIT 15
                """,
                [day_end, next_3_days],
            )
            upcoming_next_3_days = [dict(row) for row in await upcoming_result.fetchall()]

            # Get important deadlines (next 7 days, high priority)
            next_7_days = day_end + timedelta(days=7)
            deadlines_result = await conn.execute(
                """
                SELECT
                    t.id, t.external_task_id, t.title, t.priority, t.due_at
                FROM tasks_mirror t
                WHERE t.status = 'open'
                  AND t.due_at BETWEEN %s AND %s
                  AND t.priority IN (1, 2)
                ORDER BY t.due_at, t.priority
                LIMIT 10
                """,
                [day_end, next_7_days],
            )
            upcoming_deadlines = [dict(row) for row in await deadlines_result.fetchall()]

            return {
                "date": date,
                "day_of_week": report_date.strftime("%A"),
                "emails": {
                    "total": len(emails),
                    "by_category": emails_by_category,
                    "highlights": emails[:10],  # Top 10 emails
                },
                "tasks": {
                    "completed": tasks_completed,
                    "in_progress": tasks_in_progress,
                    "overdue": tasks_overdue,
                },
                "upcoming": {
                    "next_3_days": upcoming_next_3_days,
                    "next_7_days_deadlines": upcoming_deadlines,
                },
            }

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD (e.g., 2026-04-15)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request) -> HTMLResponse:
    """Serve the SPA dashboard shell. Auth is handled client-side via localStorage API key."""
    return HTMLResponse(content=_DASHBOARD_HTML)


# ─── SPA HTML ─────────────────────────────────────────────────────────────────

_DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OjeAI — Dashboard</title>
<style>
:root {
  --bg: #0f1117; --surface: #1a1d2e; --surface2: #232640;
  --border: #2d3148; --text: #e2e8f0; --muted: #64748b;
  --accent: #818cf8; --accent2: #a78bfa; --green: #34d399;
  --red: #f87171; --orange: #fb923c; --yellow: #fbbf24; --blue: #60a5fa;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       background: var(--bg); color: var(--text); min-height: 100vh; }

/* ── layout ── */
#app { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
header { background: var(--surface); border-bottom: 1px solid var(--border);
         padding: .75rem 1.5rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
#logo { font-size: 1.2rem; font-weight: 700; color: #fff; white-space: nowrap; }
#date-display { color: var(--muted); font-size: .85rem; }
#credits-bar { margin-left: auto; display: flex; align-items: center; gap: .75rem;
               font-size: .82rem; color: var(--muted); }
#credits-pct { font-weight: 600; color: var(--accent); }
.pb { width: 120px; height: 6px; background: var(--border); border-radius: 999px; overflow: hidden; }
.pb-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2));
           border-radius: 999px; transition: width .4s; }

main { display: grid; grid-template-columns: 320px 1fr; gap: 0; overflow: hidden; }
#sidebar { background: var(--surface); border-right: 1px solid var(--border);
           overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
#content { overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }

/* ── cards ── */
.card { background: var(--surface2); border: 1px solid var(--border); border-radius: 12px;
        padding: 1rem; }
.card-title { font-size: .72rem; font-weight: 600; color: var(--muted);
              text-transform: uppercase; letter-spacing: .07em; margin-bottom: .75rem; }
.stat-big { font-size: 2rem; font-weight: 700; color: var(--accent); }
.stat-label { font-size: .8rem; color: var(--muted); margin-top: .15rem; }

/* ── stats row ── */
#stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; }

/* ── tasks ── */
.task-item { display: flex; align-items: flex-start; gap: .5rem; padding: .5rem 0;
             border-bottom: 1px solid var(--border); font-size: .83rem; }
.task-item:last-child { border-bottom: none; }
.task-check { flex-shrink: 0; width: 18px; height: 18px; border: 1px solid var(--border);
              border-radius: 4px; cursor: pointer; background: var(--surface);
              display: flex; align-items: center; justify-content: center; }
.task-check:hover { border-color: var(--green); }
.task-check.done { background: var(--green); border-color: var(--green); }
.task-info { flex: 1; min-width: 0; }
.task-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-meta { font-size: .72rem; color: var(--muted); margin-top: .1rem; }
.overdue { color: var(--red) !important; }
.tag { display: inline-block; font-size: .68rem; padding: .1rem .35rem;
       border-radius: 999px; margin-left: .3rem; }
.tag-urgent { background: #3d1a1a; color: var(--red); }
.tag-high { background: #3d2a1a; color: var(--orange); }
.tag-normal { background: #1a2a3d; color: var(--blue); }
.tag-low { background: #1a3d2a; color: var(--green); }

/* ── search ── */
#search-box { display: flex; gap: .5rem; }
#search-input { flex: 1; background: var(--surface); border: 1px solid var(--border);
                border-radius: 8px; padding: .5rem .75rem; color: var(--text);
                font-size: .85rem; outline: none; }
#search-input:focus { border-color: var(--accent); }
.btn { background: var(--accent); color: #fff; border: none; border-radius: 8px;
       padding: .5rem 1rem; font-size: .82rem; cursor: pointer; font-weight: 500; white-space: nowrap; }
.btn:hover { opacity: .85; }
.btn-sm { padding: .3rem .65rem; font-size: .75rem; }
.btn-ghost { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
.btn-ghost:hover { color: var(--text); border-color: var(--accent); }

/* ── answer panel ── */
#answer-panel { display: none; background: var(--surface2); border: 1px solid var(--accent);
                border-radius: 12px; padding: 1rem; font-size: .87rem; line-height: 1.65; }
#answer-panel.visible { display: block; }
#answer-citations { margin-top: .75rem; font-size: .78rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: .5rem; }

/* ── briefing ── */
#briefing-content { font-size: .87rem; line-height: 1.7; white-space: pre-wrap;
                    color: var(--text); min-height: 60px; }
#briefing-meta { font-size: .73rem; color: var(--muted); margin-top: .5rem; }

/* ── mail list ── */
.mail-item { padding: .6rem 0; border-bottom: 1px solid var(--border); font-size: .83rem; }
.mail-item:last-child { border-bottom: none; }
.mail-date { font-size: .72rem; color: var(--muted); }
.mail-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-summary { font-size: .78rem; color: var(--muted); margin-top: .15rem;
                overflow: hidden; text-overflow: ellipsis;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.cat-badge { display: inline-block; font-size: .68rem; padding: .1rem .4rem;
             border-radius: 999px; background: var(--surface); color: var(--accent2); }

/* ── coverage mini-calendar ── */
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-top: .5rem; }
.cal-day { aspect-ratio: 1; border-radius: 4px; font-size: .62rem;
           display: flex; align-items: center; justify-content: center;
           background: var(--surface); color: var(--muted); cursor: default; }
.cal-day.has-mail { background: var(--accent); color: #fff; opacity: .85; }
.cal-day.has-mail:hover { opacity: 1; }

/* ── loading / empty ── */
.loading { color: var(--muted); font-size: .82rem; padding: .5rem 0; }
.empty { color: var(--muted); font-size: .82rem; text-align: center; padding: 1rem 0; }

/* ── login overlay ── */
#login-overlay { position: fixed; inset: 0; background: var(--bg);
                 display: flex; align-items: center; justify-content: center; z-index: 999; }
#login-box { background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
             padding: 2rem; width: 320px; text-align: center; }
#login-box h2 { font-size: 1.3rem; margin-bottom: .5rem; }
#login-box p { color: var(--muted); font-size: .85rem; margin-bottom: 1.25rem; }
#api-key-input { width: 100%; background: var(--surface2); border: 1px solid var(--border);
                 border-radius: 8px; padding: .65rem .85rem; color: var(--text);
                 font-size: .9rem; margin-bottom: .75rem; outline: none; }
#api-key-input:focus { border-color: var(--accent); }
#login-error { color: var(--red); font-size: .8rem; margin-top: .5rem; }

/* ── spinner ── */
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border);
           border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── sections toggle ── */
.section-header { display: flex; justify-content: space-between; align-items: center;
                  margin-bottom: .75rem; }
.section-header .card-title { margin-bottom: 0; }
.refresh-btn { font-size: .7rem; color: var(--muted); cursor: pointer; background: none;
               border: none; padding: 0; }
.refresh-btn:hover { color: var(--accent); }
</style>
</head>
<body>

<!-- Login overlay (hidden once key is set) -->
<div id="login-overlay">
  <div id="login-box">
    <h2>🧠 OjeAI</h2>
    <p>Podaj API Key aby uzyskać dostęp do dashboardu</p>
    <input id="api-key-input" type="password" placeholder="X-API-Key..." autofocus>
    <button class="btn" style="width:100%" onclick="doLogin()">Zaloguj</button>
    <div id="login-error"></div>
  </div>
</div>

<div id="app">
  <header>
    <span id="logo">🧠 OjeAI</span>
    <span id="date-display"></span>
    <div id="credits-bar">
      <span id="credits-label">Quatarly</span>
      <div class="pb"><div class="pb-fill" id="credits-pb" style="width:0%"></div></div>
      <span id="credits-pct">—</span>
      <button class="btn btn-ghost btn-sm" onclick="syncTasks()">↺ Sync zadań</button>
    </div>
  </header>

  <main>
    <!-- SIDEBAR: Tasks -->
    <div id="sidebar">
      <div class="card">
        <div class="section-header">
          <div class="card-title">Przeterminowane</div>
          <span id="overdue-count" style="font-size:.75rem;color:var(--red)"></span>
        </div>
        <div id="tasks-overdue"><div class="loading">Ładuję...</div></div>
      </div>
      <div class="card">
        <div class="card-title">Ten tydzień</div>
        <div id="tasks-week"><div class="loading">Ładuję...</div></div>
      </div>
      <div class="card">
        <div class="card-title">Pozostałe otwarte</div>
        <div id="tasks-other"><div class="loading">Ładuję...</div></div>
      </div>
    </div>

    <!-- MAIN CONTENT -->
    <div id="content">

      <!-- Stats row -->
      <div id="stats-row">
        <div class="card">
          <div class="card-title">Baza wiedzy</div>
          <div class="stat-big" id="stat-mails">—</div>
          <div class="stat-label" id="stat-days">maili</div>
        </div>
        <div class="card">
          <div class="card-title">Zakres dat</div>
          <div style="font-size:1rem;font-weight:600;color:var(--accent)" id="stat-earliest">—</div>
          <div class="stat-label">najstarszy</div>
          <div style="font-size:1rem;font-weight:600;color:var(--accent2);margin-top:.35rem" id="stat-latest">—</div>
          <div class="stat-label">najnowszy</div>
        </div>
        <div class="card">
          <div class="card-title">Tokeny (dziś)</div>
          <div class="stat-big" id="stat-tokens">—</div>
          <div class="stat-label" id="stat-calls">wywołań</div>
        </div>
        <div class="card">
          <div class="card-title">Quatarly</div>
          <div class="stat-big" id="stat-remaining">—</div>
          <div class="stat-label" id="stat-reset">reset —</div>
        </div>
      </div>

      <!-- AI Briefing -->
      <div class="card">
        <div class="section-header">
          <div class="card-title">📋 Dzienny Briefing AI</div>
          <div style="display:flex;gap:.5rem">
            <button class="btn btn-ghost btn-sm" onclick="loadBriefing(false)">Pokaż</button>
            <button class="btn btn-sm" onclick="loadBriefing(true)">⚡ Generuj</button>
          </div>
        </div>
        <div id="briefing-content"><span class="loading">Kliknij "Pokaż" lub "Generuj" aby załadować briefing</span></div>
        <div id="briefing-meta"></div>
      </div>

      <!-- Knowledge search -->
      <div class="card">
        <div class="card-title">🔍 Zapytaj asystenta</div>
        <div id="search-box">
          <input id="search-input" type="text" placeholder="np. co mam do zrobienia w tym tygodniu?..."
                 onkeydown="if(event.key==='Enter') doSearch()">
          <button class="btn" onclick="doSearch()">Szukaj</button>
        </div>
        <div id="answer-panel">
          <div id="answer-text"></div>
          <div id="answer-citations"></div>
        </div>
      </div>

      <!-- Recent emails -->
      <div class="card">
        <div class="section-header">
          <div class="card-title">📧 Ostatnie maile w bazie</div>
          <button class="refresh-btn" onclick="loadMails()">↺ odśwież</button>
        </div>
        <div id="mails-list"><div class="loading">Ładuję...</div></div>
      </div>

      <!-- Coverage mini calendar -->
      <div class="card">
        <div class="card-title">📅 Pokrycie bazy (ostatnie 90 dni)</div>
        <div id="cal-grid" class="cal-grid"></div>
      </div>

    </div>
  </main>
</div>

<script>
// ── State ─────────────────────────────────────────────────────────────────
let API_KEY = localStorage.getItem('ojeai_api_key') || '';
let allTasks = [];

// ── Init ──────────────────────────────────────────────────────────────────
(function init() {
  updateClock();
  setInterval(updateClock, 30000);

  if (API_KEY) {
    hideLLogin();
    loadAll();
  }
})();

function updateClock() {
  const now = new Date();
  const days = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
  const months = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  document.getElementById('date-display').textContent =
    days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear()
    + ' · ' + now.toTimeString().slice(0,5);
}

// ── Auth ──────────────────────────────────────────────────────────────────
async function doLogin() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) return;
  // Verify key by hitting health endpoint
  try {
    const r = await fetch('/v1/coverage/status', { headers: { 'X-API-Key': key } });
    if (!r.ok) throw new Error('invalid');
    API_KEY = key;
    localStorage.setItem('ojeai_api_key', key);
    hideLLogin();
    loadAll();
  } catch {
    document.getElementById('login-error').textContent = 'Nieprawidłowy klucz API';
  }
}

function hideLLogin() {
  document.getElementById('login-overlay').style.display = 'none';
}

// ── API helpers ───────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (r.status === 401) { localStorage.removeItem('ojeai_api_key'); location.reload(); }
  return r;
}

// ── Load all ──────────────────────────────────────────────────────────────
function loadAll() {
  loadStats();
  loadCredits();
  loadTasks();
  loadMails();
  loadCoverage();
}

// ── Stats ─────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await api('GET', '/v1/coverage/status');
    if (!r.ok) return;
    const d = await r.json();
    const m = d.mail_coverage;
    const l = d.llm_usage;
    document.getElementById('stat-mails').textContent = m.total_email_documents;
    document.getElementById('stat-days').textContent = m.covered_days_count + ' dni pokrytych';
    document.getElementById('stat-earliest').textContent = m.earliest_message_day || '—';
    document.getElementById('stat-latest').textContent = m.latest_message_day || '—';
    document.getElementById('stat-tokens').textContent = fmt(l.today.total_tokens);
    document.getElementById('stat-calls').textContent = l.today.calls + ' wywołań';
  } catch(e) { console.warn('stats', e); }
}

// ── Credits ───────────────────────────────────────────────────────────────
async function loadCredits() {
  try {
    const r = await api('GET', '/v1/credits/quatarly');
    if (!r.ok) return;
    const d = await r.json();
    if (!d.available) return;
    const pct = 100 * d.used_credits / d.total_credits;
    const rem = fmtCredits(d.remaining_credits);
    const reset = d.reset_date ? d.reset_date.slice(0,10) : '—';
    document.getElementById('credits-pb').style.width = pct.toFixed(1) + '%';
    document.getElementById('credits-pct').textContent = rem + ' pozostało';
    document.getElementById('stat-remaining').textContent = rem;
    document.getElementById('stat-reset').textContent = 'reset ' + reset;
    document.getElementById('credits-label').textContent =
      fmt(d.used_credits) + ' / ' + fmt(d.total_credits);
  } catch(e) { console.warn('credits', e); }
}

// ── Tasks ─────────────────────────────────────────────────────────────────
async function loadTasks() {
  setEl('tasks-overdue', '<div class="loading">Ładuję...</div>');
  setEl('tasks-week', '<div class="loading">Ładuję...</div>');
  setEl('tasks-other', '<div class="loading">Ładuję...</div>');
  try {
    const r = await api('POST', '/v1/tasks/query', { statuses: ['open'], limit: 100 });
    if (!r.ok) return;
    const d = await r.json();
    allTasks = d.tasks || [];
    renderTasks();
  } catch(e) { console.warn('tasks', e); }
}

function renderTasks() {
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);

  const overdue = [], week = [], other = [];
  allTasks.forEach(t => {
    if (t.due_at) {
      const d = new Date(t.due_at);
      if (d < today) overdue.push(t);
      else if (d <= weekEnd) week.push(t);
      else other.push(t);
    } else { other.push(t); }
  });

  document.getElementById('overdue-count').textContent = overdue.length ? overdue.length + ' ‼' : '';
  setEl('tasks-overdue', renderTaskList(overdue, true) || '<div class="empty">Brak przeterminowanych ✓</div>');
  setEl('tasks-week', renderTaskList(week) || '<div class="empty">Brak zadań w tym tygodniu</div>');
  setEl('tasks-other', renderTaskList(other.slice(0,15)) || '<div class="empty">Brak zadań</div>');
}

function renderTaskList(tasks, isOverdue=false) {
  if (!tasks.length) return '';
  const priMap = {1:'urgent',2:'high',3:'normal',4:'low'};
  const priLabel = {1:'🔴 pilne',2:'🟠 wysoki',3:'🟡 normalny',4:'🟢 niski'};
  return tasks.map(t => {
    const due = t.due_at ? new Date(t.due_at).toLocaleDateString('pl-PL') : '—';
    const pri = priMap[t.priority] || 'normal';
    const tagHtml = t.priority ? `<span class="tag tag-${pri}">${priLabel[t.priority]||''}</span>` : '';
    const dueClass = isOverdue ? 'overdue' : '';
    return `<div class="task-item">
      <div class="task-check" onclick="completeTask('${t.external_task_id}', this)" title="Oznacz jako zrobione"></div>
      <div class="task-info">
        <div class="task-title" title="${esc(t.title)}">${esc(t.title.length > 55 ? t.title.slice(0,55)+'…' : t.title)}</div>
        <div class="task-meta ${dueClass}">${due}${tagHtml}</div>
      </div>
    </div>`;
  }).join('');
}

async function completeTask(taskId, btn) {
  if (btn.classList.contains('done')) return;
  btn.innerHTML = '<div class="spinner"></div>';
  try {
    const r = await api('POST', '/v1/tasks/' + taskId + '/complete', {});
    if (r.ok) {
      btn.classList.add('done');
      btn.innerHTML = '✓';
      allTasks = allTasks.filter(t => t.external_task_id !== taskId);
      setTimeout(renderTasks, 600);
    } else { btn.innerHTML = '✗'; }
  } catch { btn.innerHTML = '✗'; }
}

async function syncTasks() {
  try {
    await api('POST', '/v1/tasks/sync', { include_archived: false });
    loadTasks();
  } catch(e) { console.warn(e); }
}

// ── Mails ─────────────────────────────────────────────────────────────────
async function loadMails() {
  setEl('mails-list', '<div class="loading">Ładuję...</div>');
  try {
    const r = await api('GET', '/v1/coverage/mail-days?day_limit=1&document_limit=25');
    if (!r.ok) return;
    const d = await r.json();
    const docs = d.recent_documents || [];
    if (!docs.length) { setEl('mails-list','<div class="empty">Brak maili</div>'); return; }
    setEl('mails-list', docs.map(doc => `
      <div class="mail-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
          <div class="mail-date">${doc.message_day || doc.ingested_at?.slice(0,10) || '—'}</div>
          ${doc.message_date_raw ? `<span class="cat-badge" style="font-size:.65rem">${esc(doc.message_date_raw.slice(0,20))}</span>` : ''}
        </div>
        <div class="mail-title" title="${esc(doc.title)}">${esc(doc.title.length > 70 ? doc.title.slice(0,70)+'…' : doc.title)}</div>
      </div>`).join(''));
  } catch(e) { console.warn('mails', e); }
}

// ── Coverage calendar ─────────────────────────────────────────────────────
async function loadCoverage() {
  try {
    const r = await api('GET', '/v1/coverage/mail-days?day_limit=90&document_limit=0');
    if (!r.ok) return;
    const d = await r.json();
    const daySet = {};
    (d.days || []).forEach(x => daySet[x.day] = x.count);

    const grid = document.getElementById('cal-grid');
    const cells = [];
    const now = new Date();
    for (let i = 89; i >= 0; i--) {
      const dt = new Date(now); dt.setDate(now.getDate() - i);
      const key = dt.toISOString().slice(0,10);
      const count = daySet[key] || 0;
      const cls = count ? 'cal-day has-mail' : 'cal-day';
      cells.push(`<div class="${cls}" title="${key}${count ? ': '+count+' maili' : ''}">${dt.getDate()}</div>`);
    }
    grid.innerHTML = cells.join('');
  } catch(e) { console.warn('coverage', e); }
}

// ── Briefing ──────────────────────────────────────────────────────────────
async function loadBriefing(forceGenerate) {
  const el = document.getElementById('briefing-content');
  const meta = document.getElementById('briefing-meta');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Generuję briefing...</div>';

  try {
    let r;
    if (forceGenerate) {
      r = await api('POST', '/v1/briefing/generate', { force: true });
    } else {
      r = await api('GET', '/v1/briefing/today');
      if (r.status === 404) {
        r = await api('POST', '/v1/briefing/generate', { force: false });
      }
    }
    if (!r.ok) { el.textContent = 'Błąd generowania briefingu'; return; }
    const d = await r.json();
    el.textContent = d.content;
    meta.textContent = (d.cached ? '📦 cache' : '⚡ nowy') + ' · ' + d.model + ' · ' + d.briefing_date;
  } catch(e) {
    el.textContent = 'Błąd: ' + e.message;
  }
}

// ── Search ────────────────────────────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const panel = document.getElementById('answer-panel');
  const answerEl = document.getElementById('answer-text');
  const citEl = document.getElementById('answer-citations');
  panel.classList.add('visible');
  answerEl.innerHTML = '<div class="loading"><div class="spinner"></div> Szukam w bazie wiedzy...</div>';
  citEl.innerHTML = '';

  try {
    const r = await api('POST', '/v1/assistant/query', {
      query: q, search_limit: 8, include_tasks: true,
      max_document_contexts: 5, max_task_contexts: 5
    });
    if (!r.ok) { answerEl.textContent = 'Błąd zapytania'; return; }
    const d = await r.json();
    answerEl.innerHTML = d.answer.replace(/\\n/g,'<br>').replace(/\\[/g,'[').replace(/\\]/g,']');
    if (d.citations && d.citations.length) {
      citEl.innerHTML = '<strong>Źródła:</strong> ' +
        d.citations.map(c => `<span title="${esc(c.excerpt||'')}">
          [${esc(c.label)}] ${esc(c.title.slice(0,50))}
        </span>`).join(' · ');
    }
  } catch(e) {
    answerEl.textContent = 'Błąd: ' + e.message;
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────
function setEl(id, html) { document.getElementById(id).innerHTML = html; }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(n) {
  n = parseInt(n) || 0;
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'G';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return String(n);
}
function fmtCredits(n) {
  n = parseInt(n) || 0;
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n/1e3) + 'k';
  return String(n);
}
</script>
</body>
</html>"""


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _fmt(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(n)
