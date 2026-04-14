<<<<<<< HEAD
import { ModuleCard } from "@/components/module-card";
import { StatCard } from "@/components/stat-card";
import {
  BotIcon,
  CalendarIcon,
  CerebroIcon,
  KnowledgeIcon,
  MailIcon,
  MeetingIcon,
  TasksIcon,
} from "@/components/icons";
import { getDashboardOverview, getOpenTasks, getQuatarlyCredits, queryDocuments, queryMeetings } from "@/lib/api";
import { formatDay, formatTokenCount, relativeCoverageLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

=======
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardOverview, getOpenTasks, getQuatarlyCredits, queryDocuments, queryMeetings } from "@/lib/api";
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

export const dynamic = "force-dynamic";

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

>>>>>>> origin/main
export default async function OverviewPage() {
  const [overview, openTasks, recentEmails, recentMeetings, credits] = await Promise.all([
    getDashboardOverview(),
    getOpenTasks(8),
    queryDocuments({ artifact_type: "email", limit: 6 }),
    queryMeetings({ limit: 4 }),
    getQuatarlyCredits(),
  ]);
<<<<<<< HEAD
=======

>>>>>>> origin/main
  const undatedRatio = relativeCoverageLabel(
    overview.mail_coverage.undated_email_documents,
    overview.mail_coverage.total_email_documents,
  );
<<<<<<< HEAD
  const quotaLabel =
    overview.llm_usage.quota_remaining_tokens !== null
=======
  const creditsValue = credits.available
    ? `${formatTokenCount(credits.remaining_credits)} credits`
    : overview.llm_usage.quota_remaining_tokens !== null
>>>>>>> origin/main
      ? `${formatTokenCount(overview.llm_usage.quota_remaining_tokens)} pozostało`
      : `${formatTokenCount(overview.llm_usage.today.total_tokens)} dziś`;

  return (
<<<<<<< HEAD
    <>
      <section className="heroPanel">
        <div className="pageHeader">
          <div>
            <span className="sectionEyebrow">Pulpit operacyjny</span>
            <h1 className="pageTitleCompact">Sterowanie mailem, terminami i baza AI</h1>
          </div>
          <div className="heroChipRow">
            <span className="pageTag">
              <strong>{overview.environment}</strong> env
            </span>
            <span className="pageTag">
              <strong>{formatDay(overview.mail_coverage.latest_message_day)}</strong> latest day
            </span>
            <span className="pageTag">
              <strong>{formatTokenCount(overview.llm_usage.today.total_tokens)}</strong> tokens today
            </span>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Ten ekran nie jest landingiem. To punkt wejscia do modulow, ktore maja czytac maile,
          wyciagac zadania, pilnowac kolejnosci terminow i dawac odpowiedzi z Twojej bazy wiedzy.
        </p>
      </section>

      <section className="statsGrid">
        <StatCard
          eyebrow="Mail coverage"
          value={formatTokenCount(overview.mail_coverage.total_email_documents)}
          detail="maili zapisanych juz na serwerze"
          accent="ember"
        >
          <span className="metricChip">{overview.mail_coverage.covered_days_count} dni pokrytych</span>
          <span className="metricChip">{undatedRatio}</span>
        </StatCard>

        <StatCard
          eyebrow="Date range"
          value={`${formatDay(overview.mail_coverage.earliest_message_day)} → ${formatDay(
            overview.mail_coverage.latest_message_day,
          )}`}
          detail="najstarszy i najnowszy rozpoznany dzien maila"
          accent="teal"
        />

        <StatCard
          eyebrow="Quatarly"
          value={
            credits.available
              ? `${formatTokenCount(credits.remaining_credits)} credits`
              : quotaLabel
          }
          detail={
            credits.available
              ? `used ${formatTokenCount(credits.used_credits)} / total ${formatTokenCount(credits.total_credits)}`
              : `${formatTokenCount(overview.llm_usage.this_month.total_tokens)} tokenow w tym miesiacu`
          }
          accent="gold"
        >
          <span className="metricChip">
            {credits.available ? `reset: ${credits.reset_date || "n/a"}` : `${overview.llm_usage.this_month.calls} wywolan`}
          </span>
          <span className="metricChip">
            prompt {formatTokenCount(overview.llm_usage.this_month.prompt_tokens)}
          </span>
        </StatCard>

        <StatCard
          eyebrow="Open tasks"
          value={String(openTasks.tasks.length)}
          detail="widoczne teraz w warstwie task execution"
          accent="ink"
        >
          <span className="metricChip">AI advisor i terminy na osobnym widoku</span>
        </StatCard>

        <StatCard
          eyebrow="Meeting pipeline"
          value={String(overview.meeting_metrics.total_meeting_documents)}
          detail={`${overview.meeting_metrics.action_items_total} action items / ${overview.meeting_metrics.vikunja_synced_tasks_total} synced`}
          accent="teal"
        >
          <span className="metricChip">
            pending sync: {overview.meeting_metrics.pending_sync_meetings}
          </span>
          <span className="metricChip">
            30 dni: {overview.meeting_metrics.meetings_last_30_days}
          </span>
        </StatCard>
      </section>

      <section className="tripleGrid">
        <ModuleCard
          href="/mailbox"
          icon={<MailIcon width={18} height={18} />}
          eyebrow="Asystent e-mail"
          title="Czytaj kazdy mail i generuj odpowiedz"
          description="Reader maili, projektowe kategorie, wyciagniete taski i szkic odpowiedzi z AI."
          stats={
            <>
              <span className="metricChip">{recentEmails.documents.length} ostatnich maili</span>
              <span className="metricChip">
                latest {formatDay(recentEmails.documents[0]?.message_day)}
              </span>
            </>
          }
        />
        <ModuleCard
          href="/tasks"
          icon={<TasksIcon width={18} height={18} />}
          eyebrow="Task execution"
          title="Terminy i podpowiedz AI jak dowiezc zadanie"
          description="Lista rzeczy do zrobienia, zaleglosci i AI advisor prowadzacy krok po kroku."
          stats={
            <>
              <span className="metricChip">{openTasks.tasks.length} otwartych</span>
              <span className="metricChip">
                {openTasks.tasks.filter((task) => task.due_at).length} z terminem
              </span>
            </>
          }
        />
        <ModuleCard
          href="/schedule"
          icon={<CalendarIcon width={18} height={18} />}
          eyebrow="Kalendarz"
          title="Kolejnosc pracy i porzadek terminow"
          description="Widok dnia i tygodnia oparty o deadline'y z maili i task mirror, bez skakania po listach."
          stats={
            <>
              <span className="metricChip">{openTasks.tasks.filter((task) => task.due_at).length} z terminem</span>
              <span className="metricChip">timeline pracy</span>
            </>
          }
        />
        <ModuleCard
          href="/copilot"
          icon={<BotIcon width={18} height={18} />}
          eyebrow="AI copilot"
          title="Pytania i odpowiedzi z cytowaniami"
          description="Chat AI, ktory ma korzystac z Twojej bazy, a nie odpowiadac z pamieci modelu."
          stats={
            <>
              <span className="metricChip">{formatTokenCount(overview.llm_usage.today.total_tokens)} dzis</span>
              <span className="metricChip">{overview.llm_usage.today.calls} wywolan</span>
            </>
          }
        />
        <ModuleCard
          href="/cerebro"
          icon={<CerebroIcon width={18} height={18} />}
          eyebrow="Cerebro"
          title="Ryzusiowe Lenistwo jako moduł operacyjny"
          description="Backlog spotkań, action items, deadline'y i chat AI do układania planu po kolei."
          stats={
            <>
              <span className="metricChip">{recentMeetings.meetings.length} analiz</span>
              <span className="metricChip">meeting intelligence</span>
            </>
          }
        />
        <ModuleCard
          href="/knowledge"
          icon={<KnowledgeIcon width={18} height={18} />}
          eyebrow="Wiedza"
          title="Kategorie, projekty i pokrycie archiwum"
          description="Kontrola nad tym, czy maile sa juz sensownie poukladane i od kiedy baza jest wiarygodna."
          stats={
            <>
              <span className="metricChip">{overview.top_categories.length} kategorii</span>
              <span className="metricChip">{overview.mail_coverage.covered_days_count} dni</span>
            </>
          }
        />
        <ModuleCard
          href="/meetings"
          icon={<MeetingIcon width={18} height={18} />}
          eyebrow="Meeting intake"
          title="Wczytuj analizy spotkan do tej samej bazy"
          description="Twoja druga aplikacja produkuje analizy, a ten modul zapisuje je jako kolejne zrodla wiedzy."
          stats={
            <>
              <span className="metricChip">{recentMeetings.meetings.length} spotkan</span>
              <span className="metricChip">
                pending sync {overview.meeting_metrics.pending_sync_meetings}
              </span>
            </>
          }
        />
      </section>

      <section className="doubleGrid">
        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Recent emails</span>
              <h2 className="sectionTitle">Ostatnio wgrane maile</h2>
            </div>
            <div className="sectionNote">gotowe do otwarcia w Mail Hub</div>
          </div>

          <table className="dataTable">
            <thead>
              <tr>
                <th>Dzień</th>
                <th>Tytuł</th>
                <th>Kategoria</th>
              </tr>
            </thead>
            <tbody>
              {recentEmails.documents.slice(0, 8).map((document) => (
                <tr key={`${document.title}-${document.created_at}`}>
                  <td>{document.message_day ?? "bez daty"}</td>
                  <td>
                    <strong>{document.title}</strong>
                    <span className="mutedText">{document.summary ?? "Brak streszczenia"}</span>
                  </td>
                  <td>{document.category ?? "uncategorized"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Categorization</span>
              <h2 className="sectionTitle">Top kategorie maili</h2>
            </div>
          </div>

          <div className="categoryList">
            {overview.top_categories.map((category) => {
              const topCount = overview.top_categories[0]?.count || 1;
              const width = Math.max(10, Math.round((category.count / topCount) * 100));
              return (
                <div className="categoryRow" key={category.category}>
                  <div className="sectionHeader">
                    <strong>{category.category}</strong>
                    <span className="sectionNote">{category.count}</span>
                  </div>
                  <div className="categoryBar">
                    <div className="categoryFill" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="miniGrid">
        <article className="miniStat">
          <span>Mail ingestion</span>
          <strong>Nowe maile mozna wrzucac dalej</strong>
          <p>
            Ostatni rozpoznany dzien i ostatni ingest sa juz widoczne na pulpicie.
          </p>
        </article>
        <article className="miniStat">
          <span>Projektowa rola</span>
          <strong>Dashboard steruje modulami</strong>
          <p>
            Mail, taski, kalendarz, copilot, wiedza i spotkania sa oddzielnymi powierzchniami pracy.
          </p>
        </article>
        <article className="miniStat">
          <span>Warunek zdrowia</span>
          <strong>Coverage + quota + timeline</strong>
          <p>
            Jesli te trzy sygnaly sa zdrowe, AI ma realna baze do odpowiadania, planowania i porzadkowania pracy.
          </p>
        </article>
      </section>
    </>
=======
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
>>>>>>> origin/main
  );
}
