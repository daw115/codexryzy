"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDay, formatTokenCount, relativeCoverageLabel } from "@/lib/format";
import {
  FileText,
  CheckSquare,
  AlertTriangle,
  Calendar,
  Mail,
  Sparkles,
  Brain,
  Database,
  BarChart3,
} from "lucide-react";
import type {
  DashboardOverviewResponse,
  TaskListResponse,
  DocumentQueryResponse,
  MeetingQueryResponse,
  QuatarlyCreditsResponse,
} from "@/lib/types";

function KpiCard({
  title,
  value,
  icon: Icon,
  detail,
  color,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  detail?: string;
  color: string;
}) {
  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    overview: DashboardOverviewResponse | null;
    openTasks: TaskListResponse | null;
    recentEmails: DocumentQueryResponse | null;
    recentMeetings: MeetingQueryResponse | null;
    credits: QuatarlyCreditsResponse | null;
  }>({
    overview: null,
    openTasks: null,
    recentEmails: null,
    recentMeetings: null,
    credits: null,
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_WORK_ASSISTANT_API_URL;
        const apiKey = process.env.NEXT_PUBLIC_WORK_ASSISTANT_API_KEY;

        if (!apiUrl || !apiKey) {
          throw new Error("API configuration missing");
        }

        const headers = {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        };

        const [overview, openTasks, recentEmails, recentMeetings, credits] = await Promise.all([
          fetch(`${apiUrl}/v1/dashboard/overview`, { headers }).then(r => r.json()),
          fetch(`${apiUrl}/v1/tasks/query`, {
            method: "POST",
            headers,
            body: JSON.stringify({ statuses: ["open"], limit: 8 }),
          }).then(r => r.json()),
          fetch(`${apiUrl}/v1/documents/query`, {
            method: "POST",
            headers,
            body: JSON.stringify({ artifact_type: "email", limit: 6 }),
          }).then(r => r.json()),
          fetch(`${apiUrl}/v1/meetings/query?limit=4`, { headers }).then(r => r.json()),
          fetch(`${apiUrl}/v1/credits/quatarly`, { headers }).then(r => r.json()),
        ]);

        setData({ overview, openTasks, recentEmails, recentMeetings, credits });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !data.overview || !data.openTasks || !data.recentEmails || !data.recentMeetings || !data.credits) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-500">Error loading dashboard. Please check API connection.</div>
      </div>
    );
  }

  const { overview, openTasks, recentEmails, recentMeetings, credits } = data;

  const undatedRatio = relativeCoverageLabel(
    overview.mail_coverage.undated_email_documents,
    overview.mail_coverage.total_email_documents,
  );
  const creditsValue = credits.available
    ? `${formatTokenCount(credits.remaining_credits)} credits`
    : overview.llm_usage.quota_remaining_tokens !== null
      ? `${formatTokenCount(overview.llm_usage.quota_remaining_tokens)} pozostało`
      : `${formatTokenCount(overview.llm_usage.today.total_tokens)} dziś`;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {overview.environment} env · Ostatni mail: {formatDay(overview.mail_coverage.latest_message_day)}
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Maile w KB"
          value={formatTokenCount(overview.mail_coverage.total_email_documents)}
          icon={FileText}
          detail={`${overview.mail_coverage.covered_days_count} dni pokrytych`}
          color="bg-primary/10 text-primary"
        />
        <KpiCard
          title="Otwarte taski"
          value={String(openTasks.tasks.length)}
          icon={CheckSquare}
          detail={`${openTasks.tasks.filter((t) => t.due_at).length} z terminem`}
          color="bg-info/10 text-info"
        />
        <KpiCard
          title="Spotkania"
          value={String(overview.meeting_metrics.total_meeting_documents)}
          icon={Calendar}
          detail={`${overview.meeting_metrics.pending_sync_meetings} oczekuje sync`}
          color="bg-accent/10 text-accent"
        />
        <KpiCard
          title="Tokeny dziś"
          value={formatTokenCount(overview.llm_usage.today.total_tokens)}
          icon={Brain}
          detail={`${overview.llm_usage.today.calls} wywołań`}
          color="bg-warning/10 text-warning"
        />
        <KpiCard
          title="Quatarly"
          value={creditsValue}
          icon={BarChart3}
          detail={credits.available ? `reset: ${credits.reset_date ?? "n/a"}` : undefined}
          color="bg-success/10 text-success"
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent emails */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Ostatnio wgrane maile
                </CardTitle>
                <CardDescription>
                  Gotowe do otwarcia w Mail Hub · {recentEmails.documents.length} ostatnich
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentEmails.documents.slice(0, 6).map((doc) => (
                <div
                  key={`${doc.title}-${doc.created_at}`}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {doc.summary ?? "Brak streszczenia"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{doc.message_day ?? "—"}</span>
                    <Badge variant="secondary" className="text-xs">
                      {doc.category ?? "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top categories */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              Top kategorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.top_categories.map((cat) => {
                const topCount = overview.top_categories[0]?.count || 1;
                const pct = Math.max(8, Math.round((cat.count / topCount) * 100));
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">{cat.category}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">{cat.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Moduły
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              href: "/mailbox",
              title: "Asystent e-mail",
              desc: "Reader maili, kategorie, taski i szkic odpowiedzi AI.",
              meta: `${recentEmails.documents.length} maili · latest ${formatDay(recentEmails.documents[0]?.message_day)}`,
              icon: Mail,
              color: "bg-primary/10 text-primary",
            },
            {
              href: "/tasks",
              title: "Task execution",
              desc: "Lista zadań, zaległości i AI advisor krok po kroku.",
              meta: `${openTasks.tasks.length} otwartych · ${openTasks.tasks.filter((t) => t.due_at).length} z terminem`,
              icon: CheckSquare,
              color: "bg-info/10 text-info",
            },
            {
              href: "/schedule",
              title: "Kalendarz",
              desc: "Kolejność pracy z deadlinów i maili.",
              meta: `${openTasks.tasks.filter((t) => t.due_at).length} z terminem`,
              icon: Calendar,
              color: "bg-accent/10 text-accent",
            },
            {
              href: "/copilot",
              title: "AI Copilot",
              desc: "Chat AI nad bazą wiedzy — maile, dokumenty, taski.",
              meta: `${formatTokenCount(overview.llm_usage.today.total_tokens)} tokenów dziś`,
              icon: Brain,
              color: "bg-warning/10 text-warning",
            },
            {
              href: "/cerebro",
              title: "Cerebro",
              desc: "Backlog spotkań, action items, sync z Vikunja.",
              meta: `${recentMeetings.meetings.length} analiz`,
              icon: Sparkles,
              color: "bg-purple-500/10 text-purple-400",
            },
            {
              href: "/knowledge",
              title: "Wiedza",
              desc: "Kategorie, pokrycie archiwum i luki w danych.",
              meta: `${overview.top_categories.length} kategorii · ${overview.mail_coverage.covered_days_count} dni`,
              icon: Database,
              color: "bg-success/10 text-success",
            },
          ].map((mod) => (
            <a key={mod.href} href={mod.href}>
              <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${mod.color}`}>
                      <mod.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{mod.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mod.desc}</p>
                      <p className="text-xs text-primary mt-2">{mod.meta}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>

      {/* Coverage stats */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Zakres: </span>
              <span className="font-medium">
                {overview.mail_coverage.earliest_message_day ?? "—"} →{" "}
                {overview.mail_coverage.latest_message_day ?? "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Bez daty: </span>
              <span className="font-medium">{undatedRatio}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Meeting action items: </span>
              <span className="font-medium">
                {overview.meeting_metrics.action_items_total} /{" "}
                {overview.meeting_metrics.vikunja_synced_tasks_total} synced
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
