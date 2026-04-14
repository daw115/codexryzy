<<<<<<< HEAD
import { StatCard } from "@/components/stat-card";
import { getDashboardOverview, getQuatarlyCredits } from "@/lib/api";
import { formatTokenCount } from "@/lib/format";
=======
import { getDashboardOverview, getQuatarlyCredits } from "@/lib/api";
import { formatTokenCount } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Settings, Activity, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
>>>>>>> origin/main

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const [overview, credits] = await Promise.all([getDashboardOverview(), getQuatarlyCredits()]);
  const quota = overview.llm_usage.quota_monthly_tokens;
  const quotaUsed = overview.llm_usage.this_month.total_tokens;
  const quotaPercent = quota ? Math.min(100, Math.round((quotaUsed / quota) * 100)) : null;

<<<<<<< HEAD
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
=======
  const services = [
    { name: "FastAPI Backend", status: "healthy" as const },
    { name: "LLM API", status: overview.llm_usage.today.calls > 0 ? "healthy" as const : "degraded" as const },
    { name: "Mail Coverage", status: overview.mail_coverage.covered_days_count > 0 ? "healthy" as const : "degraded" as const },
    { name: "Meeting Pipeline", status: overview.meeting_metrics.total_meeting_documents > 0 ? "healthy" as const : "down" as const },
  ];

  const statusCfg = {
    healthy: { icon: CheckCircle, color: "text-success", badge: "bg-success/10 text-success border-success/20" },
    degraded: { icon: AlertTriangle, color: "text-warning", badge: "bg-warning/10 text-warning border-warning/20" },
    down: { icon: AlertTriangle, color: "text-destructive", badge: "bg-destructive/10 text-destructive border-destructive/20" },
  };

  const externalLinks = [
    {
      title: "/healthz",
      desc: "Szybki ping backendu wiedzy",
      href: process.env.WORK_ASSISTANT_API_URL ? `${process.env.WORK_ASSISTANT_API_URL}/healthz` : "#",
    },
    {
      title: "/docs",
      desc: "OpenAPI dla serwisów operacyjnych",
      href: process.env.WORK_ASSISTANT_API_URL ? `${process.env.WORK_ASSISTANT_API_URL}/docs` : "#",
    },
    {
      title: "HTML Dashboard",
      desc: "Stary panel admina w FastAPI",
      href: process.env.WORK_ASSISTANT_API_URL ? `${process.env.WORK_ASSISTANT_API_URL}/dashboard` : "#",
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-muted-foreground" />
          Operacje
        </h1>
        <p className="text-muted-foreground mt-1">
          Guardrails, quota i techniczne punkty kontrolne · env: {overview.environment}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Tokeny dziś", value: formatTokenCount(overview.llm_usage.today.total_tokens), sub: `${overview.llm_usage.today.calls} wywołań` },
          { label: "Miesiąc", value: formatTokenCount(overview.llm_usage.this_month.total_tokens), sub: `${overview.llm_usage.this_month.calls} wywołań` },
          { label: "Credits", value: credits.available ? formatTokenCount(credits.remaining_credits) : "n/a", sub: credits.available ? `reset: ${credits.reset_date ?? "n/a"}` : credits.error ?? "brak" },
          { label: "Bez daty", value: formatTokenCount(overview.mail_coverage.undated_email_documents), sub: "maile wymagające repair" },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health check */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Health Check
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {services.map((service) => {
              const cfg = statusCfg[service.status];
              const Icon = cfg.icon;
              return (
                <div key={service.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                    <p className="text-sm font-medium">{service.name}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${cfg.badge}`}>
                    {service.status}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Quota */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quota i koszt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-sm font-medium">Zużyte w miesiącu</p>
              <p className="text-xl font-bold mt-1">{formatTokenCount(quotaUsed)}</p>
              {quota && (
                <p className="text-xs text-muted-foreground">z limitu {formatTokenCount(quota)}</p>
              )}
            </div>
            {quotaPercent !== null && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Wykorzystanie limitu</span>
                  <span className="font-medium">{quotaPercent}%</span>
                </div>
                <Progress value={quotaPercent} />
              </div>
            )}
            {credits.available ? (
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-sm font-medium">Credits pozostałe</p>
                <p className="text-xl font-bold mt-1">{formatTokenCount(credits.remaining_credits)}</p>
                <p className="text-xs text-muted-foreground">
                  used {formatTokenCount(credits.used_credits)} / total {formatTokenCount(credits.total_credits)}
                  {credits.expires_at ? ` · expires ${credits.expires_at}` : ""}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
                Credits API niedostępne: {credits.error ?? "sprawdź konfigurację"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security model */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Model bezpieczeństwa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { title: "Frontend jako BFF", desc: "API key nie wychodzi do przeglądarki. Requesty do API tylko po stronie serwera." },
              { title: "Session cookie", desc: "Sesja podpisana DASHBOARD_SESSION_SECRET w HttpOnly cookie." },
              { title: "Dashboard jako osobny serwis", desc: "Odcina UI od tymczasowego /dashboard w FastAPI." },
            ].map((item) => (
              <div key={item.title} className="p-3 rounded-lg bg-muted/30">
                <p className="font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* External links */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Punkty kontrolne</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {externalLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:border hover:border-primary/30 transition-colors cursor-pointer"
              >
                <div>
                  <p className="text-sm font-medium">{link.title}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Meeting pipeline */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Meeting Pipeline Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: "Dokumenty spotkań", value: overview.meeting_metrics.total_meeting_documents },
              { label: "Action items", value: overview.meeting_metrics.action_items_total },
              { label: "Vikunja synced", value: overview.meeting_metrics.vikunja_synced_tasks_total },
              { label: "Sync backlog", value: overview.meeting_metrics.pending_sync_meetings },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-xl font-bold mt-1">{m.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
>>>>>>> origin/main
  );
}
