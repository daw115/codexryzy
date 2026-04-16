import { getDashboardOverview, getQuatarlyCredits } from "@/lib/api";

export const dynamic = "force-dynamic";

import { formatTokenCount } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Settings, Activity, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";


export default async function OperationsPage() {
  const [overview, credits] = await Promise.all([getDashboardOverview(), getQuatarlyCredits()]);
  const quota = overview.llm_usage.quota_monthly_tokens;
  const quotaUsed = overview.llm_usage.this_month.total_tokens;
  const quotaPercent = quota ? Math.min(100, Math.round((quotaUsed / quota) * 100)) : null;

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
  );
}
