import { StatCard } from "@/components/stat-card";
import { getDashboardOverview, getQuatarlyCredits } from "@/lib/api";
import { formatTokenCount } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const [overview, credits] = await Promise.all([getDashboardOverview(), getQuatarlyCredits()]);
  const quota = overview.llm_usage.quota_monthly_tokens;
  const quotaUsed = overview.llm_usage.this_month.total_tokens;
  const quotaPercent = quota ? Math.min(100, Math.round((quotaUsed / quota) * 100)) : null;

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Operations</span>
            <h1 className="pageTitleCompact">Guardrails, quota i techniczne punkty kontrolne</h1>
          </div>
          <div className="heroChipRow">
            <span className="pageTag">
              <strong>{overview.environment}</strong> env
            </span>
            <span className="pageTag">
              <strong>
                {credits.available
                  ? formatTokenCount(credits.remaining_credits)
                  : formatTokenCount(overview.llm_usage.today.total_tokens)}
              </strong>{" "}
              {credits.available ? "credits left" : "today"}
            </span>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Ta strona nie ma sprzedawac narracji. Ma pokazac, czy quota, repair backlog i dostep do
          API sa w stanie, ktory pozwala dalej zaufac systemowi.
        </p>
      </section>

      <section className="statsGrid">
        <StatCard
          eyebrow="Usage dzis"
          value={formatTokenCount(overview.llm_usage.today.total_tokens)}
          detail={`${overview.llm_usage.today.calls} wywolan`}
          accent="gold"
        />
        <StatCard
          eyebrow="Miesiac"
          value={formatTokenCount(overview.llm_usage.this_month.total_tokens)}
          detail="zuzycie tokenow Quatarly zarejestrowane przez backend"
          accent="ember"
        />
        <StatCard
          eyebrow="Quatarly credits"
          value={credits.available ? formatTokenCount(credits.remaining_credits) : "n/a"}
          detail={
            credits.available
              ? `used ${formatTokenCount(credits.used_credits)} / total ${formatTokenCount(credits.total_credits)}`
              : credits.error ?? "brak danych credits"
          }
          accent="gold"
        />
        <StatCard
          eyebrow="Bez daty zrodlowej"
          value={formatTokenCount(overview.mail_coverage.undated_email_documents)}
          detail="maile nadal wymagajace poprawy naglowkow"
          accent="ink"
        />
        <StatCard
          eyebrow="Latest message day"
          value={overview.mail_coverage.latest_message_day ?? "—"}
          detail="ostatni rozpoznany dzien w KB"
          accent="teal"
        />
        <StatCard
          eyebrow="Meeting docs"
          value={formatTokenCount(overview.meeting_metrics.total_meeting_documents)}
          detail={`${overview.meeting_metrics.meetings_last_30_days} w ostatnich 30 dniach`}
          accent="teal"
        />
        <StatCard
          eyebrow="Action items"
          value={formatTokenCount(overview.meeting_metrics.action_items_total)}
          detail={`${overview.meeting_metrics.open_tasks_total} otwartych w mirrorze`}
          accent="ink"
        />
        <StatCard
          eyebrow="Sync backlog"
          value={formatTokenCount(overview.meeting_metrics.pending_sync_meetings)}
          detail={`${overview.meeting_metrics.vikunja_synced_tasks_total} tasków zsynchronizowanych`}
          accent="ember"
        />
      </section>

      <section className="doubleGrid">
        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Quota rail</span>
              <h2 className="sectionTitle">Koszt i limit</h2>
            </div>
          </div>
          <div className="stack">
            <div className="calloutCard">
              <strong>Zuzyte w miesiacu: {formatTokenCount(quotaUsed)}</strong>
              <p>
                {quota
                  ? `Z ustawionego limitu ${formatTokenCount(quota)}.`
                  : "Miesieczna kwota nie jest jeszcze ustawiona, wiec pole remaining jest tylko placeholderem."}
              </p>
            </div>
            {credits.available ? (
              <div className="calloutCard">
                <strong>Credits pozostałe: {formatTokenCount(credits.remaining_credits)}</strong>
                <p>
                  Reset: {credits.reset_date || "n/a"}
                  {credits.expires_at ? ` / Expires: ${credits.expires_at}` : ""}
                </p>
              </div>
            ) : (
              <div className="calloutCard">
                <strong>Credits API niedostępne</strong>
                <p>{credits.error ?? "Sprawdź QUATARLY_CREDITS_BASE_URL i LLM_API_KEY."}</p>
              </div>
            )}
            {quotaPercent !== null ? (
              <div className="signalRow">
                <div className="listCardHeader">
                  <span className="listCardTitle">Wykorzystanie limitu</span>
                  <span className="listCardMeta">{quotaPercent}%</span>
                </div>
                <div className="progressTrack">
                  <div className="progressFill" style={{ width: `${quotaPercent}%` }} />
                </div>
              </div>
            ) : null}
            <div className="calloutCard">
              <strong>Wywolania dzis: {overview.llm_usage.today.calls}</strong>
              <p>
                To jest uzyteczne jako szybki sygnal, czy pipeline i dashboard rzeczywiscie zyja,
                a nie tylko wisza jako deploy.
              </p>
            </div>
          </div>
        </article>

        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Guardrails</span>
              <h2 className="sectionTitle">Model bezpieczenstwa</h2>
            </div>
          </div>
          <div className="operationsList">
            <div className="operationRow">
              <strong>Frontend jako BFF</strong>
              <span className="mutedText">
                `WORK_ASSISTANT_API_KEY` nie wychodzi do przegladarki. Wszystkie requesty do API sa
                wykonywane po stronie serwera.
              </span>
            </div>
            <div className="operationRow">
              <strong>Dashboard jako osobny serwis</strong>
              <span className="mutedText">
                To odcina UI od tymczasowego technicznego `/dashboard` w FastAPI i daje osobne
                logowanie.
              </span>
            </div>
            <div className="operationRow">
              <strong>Session cookie</strong>
              <span className="mutedText">
                Sesja jest podpisywana `DASHBOARD_SESSION_SECRET` i trzymana w `HttpOnly` cookie.
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Meeting pipeline health</span>
            <h2 className="sectionTitle">Intake → analiza → task sync</h2>
          </div>
        </div>
        <div className="operationsList">
          <div className="operationRow">
            <strong>Dokumenty spotkań</strong>
            <span className="mutedText">
              {overview.meeting_metrics.total_meeting_documents} łącznie / {overview.meeting_metrics.meetings_last_30_days} w 30 dniach.
            </span>
          </div>
          <div className="operationRow">
            <strong>Action items</strong>
            <span className="mutedText">
              {overview.meeting_metrics.action_items_total} wykrytych / {overview.meeting_metrics.mirrored_tasks_total} w `tasks_mirror`.
            </span>
          </div>
          <div className="operationRow">
            <strong>Vikunja sync</strong>
            <span className="mutedText">
              {overview.meeting_metrics.vikunja_synced_tasks_total} zsynchronizowanych, backlog spotkań do dosynchronizowania: {overview.meeting_metrics.pending_sync_meetings}.
            </span>
          </div>
        </div>
      </section>

      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Techniczne linki</span>
            <h2 className="sectionTitle">Punkty kontrolne</h2>
          </div>
        </div>
        <div className="utilityLinks">
          <a
            className="utilityLink"
            href={process.env.WORK_ASSISTANT_API_URL ? `${process.env.WORK_ASSISTANT_API_URL}/healthz` : "#"}
            target="_blank"
            rel="noreferrer"
          >
            <strong>/healthz</strong>
            <p>Szybki ping backendu wiedzy.</p>
          </a>
          <a
            className="utilityLink"
            href={process.env.WORK_ASSISTANT_API_URL ? `${process.env.WORK_ASSISTANT_API_URL}/docs` : "#"}
            target="_blank"
            rel="noreferrer"
          >
            <strong>/docs</strong>
            <p>OpenAPI dla serwisow operacyjnych i integracji.</p>
          </a>
          <a
            className="utilityLink"
            href={process.env.WORK_ASSISTANT_API_URL ? `${process.env.WORK_ASSISTANT_API_URL}/dashboard` : "#"}
            target="_blank"
            rel="noreferrer"
          >
            <strong>Techniczny HTML dashboard</strong>
            <p>Stary panel admina w FastAPI, zostawiony jako fallback techniczny.</p>
          </a>
        </div>
      </section>
    </>
  );
}
