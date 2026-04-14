import { AppShell } from "@/components/app-shell";
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
    <AppShell
      coveredDays={String(overview.mail_coverage.covered_days_count)}
      creditsLabel={creditsLabel}
      latestCoverageDay={latestCoverageDay}
    >
      {children}
    </AppShell>
  );
}
