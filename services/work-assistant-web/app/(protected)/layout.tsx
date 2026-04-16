"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { formatTokenCount } from "@/lib/format";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    coveredDays: string;
    creditsLabel: string;
    latestCoverageDay: string;
  } | null>(null);

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

        const [overview, credits] = await Promise.all([
          fetch(`${apiUrl}/v1/dashboard/overview`, { headers }).then(r => r.json()),
          fetch(`${apiUrl}/v1/credits/quatarly`, { headers }).then(r => r.json()),
        ]);

        const latestCoverageDay = overview.mail_coverage.latest_message_day ?? "brak";
        const creditsLabel = credits.available
          ? `${formatTokenCount(credits.remaining_credits)} cr`
          : overview.llm_usage.quota_remaining_tokens !== null
            ? `${formatTokenCount(overview.llm_usage.quota_remaining_tokens)} tk`
            : `${formatTokenCount(overview.llm_usage.today.total_tokens)} tk`;

        setData({
          coveredDays: String(overview.mail_coverage.covered_days_count),
          creditsLabel,
          latestCoverageDay,
        });
      } catch (err) {
        console.error("Failed to load layout data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <AppShell
      coveredDays={data.coveredDays}
      creditsLabel={data.creditsLabel}
      latestCoverageDay={data.latestCoverageDay}
    >
      {children}
    </AppShell>
  );
}
