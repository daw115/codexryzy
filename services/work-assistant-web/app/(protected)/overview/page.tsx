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

export default async function OverviewPage() {
  const [overview, openTasks, recentEmails, recentMeetings, credits] = await Promise.all([
    getDashboardOverview(),
    getOpenTasks(8),
    queryDocuments({ artifact_type: "email", limit: 6 }),
    queryMeetings({ limit: 4 }),
    getQuatarlyCredits(),
  ]);
  const undatedRatio = relativeCoverageLabel(
    overview.mail_coverage.undated_email_documents,
    overview.mail_coverage.total_email_documents,
  );
  const quotaLabel =
    overview.llm_usage.quota_remaining_tokens !== null
      ? `${formatTokenCount(overview.llm_usage.quota_remaining_tokens)} pozostało`
      : `${formatTokenCount(overview.llm_usage.today.total_tokens)} dziś`;

  return (
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
  );
}
