import { NavLink } from "@/components/nav-link";
import {
  BellIcon,
  BotIcon,
  CalendarIcon,
  CerebroIcon,
  DashboardIcon,
  KnowledgeIcon,
  LogoIcon,
  MailIcon,
  MeetingIcon,
  OperationsIcon,
  SearchIcon,
  TasksIcon,
} from "@/components/icons";
import { logoutAction } from "@/app/(protected)/actions";
import { getDashboardOverview, getQuatarlyCredits } from "@/lib/api";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatTokenCount } from "@/lib/format";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  requireAuthenticatedUser();
  const [overview, credits] = await Promise.all([getDashboardOverview(), getQuatarlyCredits()]);
  const latestCoverageDay = overview.mail_coverage.latest_message_day ?? "brak";
  const creditsLabel = credits.available
    ? `${formatTokenCount(credits.remaining_credits)} cr`
    : overview.llm_usage.quota_remaining_tokens !== null
      ? `${formatTokenCount(overview.llm_usage.quota_remaining_tokens)} tk`
      : `${formatTokenCount(overview.llm_usage.today.total_tokens)} tk`;

  return (
    <div className="pageShell">
      <div className="dashboardShell">
        <aside className="sidebar">
          <div className="brandBlock">
            <div className="brandRow">
              <div className="brandMark">
                <LogoIcon width={24} height={24} />
              </div>
              <div>
                <span className="shellEyebrow">Private workspace</span>
                <h1 className="brandTitle">WorkAssistant</h1>
              </div>
            </div>
            <p className="brandCopy">Mail, zadania, kalendarz i AI w jednym operacyjnym shellu.</p>
          </div>

          <div className="sidebarSection">
            <span className="sidebarLabel">Moduly</span>
            <nav className="sidebarNav">
              <NavLink href="/overview" label="Pulpit" icon={<DashboardIcon width={18} height={18} />} />
              <NavLink href="/mailbox" label="E-mail" icon={<MailIcon width={18} height={18} />} />
              <NavLink href="/cerebro" label="Cerebro" icon={<CerebroIcon width={18} height={18} />} />
              <NavLink href="/copilot" label="Agent AI" icon={<BotIcon width={18} height={18} />} />
              <NavLink href="/tasks" label="Zadania" icon={<TasksIcon width={18} height={18} />} />
              <NavLink href="/schedule" label="Kalendarz" icon={<CalendarIcon width={18} height={18} />} />
              <NavLink href="/knowledge" label="Wiedza" icon={<KnowledgeIcon width={18} height={18} />} />
              <NavLink href="/meetings" label="Spotkania" icon={<MeetingIcon width={18} height={18} />} />
              <NavLink href="/operations" label="Operacje" icon={<OperationsIcon width={18} height={18} />} />
            </nav>
          </div>

          <div className="sidebarFooter">
            <div className="sidebarCard">
              <div className="sidebarMeta">
                <strong>Model dostepu</strong>
                Frontend jako BFF, sesja wlasciciela, API key tylko na serwerze.
              </div>
              <div className="sidebarMeta">
                <strong>Stack</strong>
                Railway, FastAPI, n8n, Vikunja, Quatarly.
              </div>
            </div>
            <form action={logoutAction}>
              <button className="ghostButton" type="submit">
                Wyloguj
              </button>
            </form>
          </div>
        </aside>

        <main className="mainPanel">
          <div className="shellTopbar">
            <div className="shellTopbarLeft">
              <div className="shellSearch">
                <span className="shellSearchIcon">
                  <SearchIcon width={16} height={16} />
                </span>
                <input
                  className="shellSearchInput"
                  value=""
                  readOnly
                  placeholder={`Ostatni rozpoznany dzien maila: ${latestCoverageDay}`}
                />
                <span className="shellSearchHint">K</span>
              </div>
            </div>
            <div className="shellTopbarRight">
              <span className="topAction" title="Pokryte dni maili">
                {overview.mail_coverage.covered_days_count} dni
              </span>
              <span className="topAction" title="Pozostale kredyty lub tokeny">
                {creditsLabel}
              </span>
              <span className="topAction topActionAlert">
                <BellIcon width={14} height={14} />
              </span>
              <span className="userBadge">DA</span>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
