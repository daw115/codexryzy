import { DayCoverage } from "@/components/day-coverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getDashboardOverview } from "@/lib/api";
import { formatDay, formatTokenCount } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Database, AlertCircle, CheckCircle } from "lucide-react";
import type { MailCoverageDay } from "@/lib/types";


type CoverageGap = { from: string; to: string; days: number };

function toUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
function addUtcDays(day: Date, amount: number): Date {
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}
function toDayIso(day: Date): string {
  return day.toISOString().slice(0, 10);
}
function diffUtcDays(startIso: string, endIso: string): number {
  return Math.floor((toUtcDay(endIso).getTime() - toUtcDay(startIso).getTime()) / (24 * 60 * 60 * 1000));
}
function buildCoverageGaps(days: MailCoverageDay[]): CoverageGap[] {
  if (days.length < 2) return [];
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const gaps: CoverageGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = diffUtcDays(sorted[i - 1].day, sorted[i].day);
    if (diff <= 1) continue;
    gaps.push({
      from: toDayIso(addUtcDays(toUtcDay(sorted[i - 1].day), 1)),
      to: toDayIso(addUtcDays(toUtcDay(sorted[i].day), -1)),
      days: diff - 1,
    });
  }
  return gaps;
}

export default async function KnowledgePage() {
  const overview = await getDashboardOverview();
  const coverageGaps = buildCoverageGaps(overview.mail_coverage.days);
  const totalGapDays = coverageGaps.reduce((sum, g) => sum + g.days, 0);
  const coveredDays = overview.mail_coverage.covered_days_count;
  const totalDays = coveredDays + totalGapDays;
  const coveragePct = totalDays > 0 ? Math.round((coveredDays / totalDays) * 100) : 100;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-success" />
          Wiedza
        </h1>
        <p className="text-muted-foreground mt-1">
          Kategorie, projekty i pokrycie archiwum
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Pokrycie</p>
            <p className="text-3xl font-bold mt-1">{coveragePct}%</p>
            <Progress value={coveragePct} className="mt-3" />
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Pokryte dni</p>
            <p className="text-3xl font-bold mt-1">{coveredDays}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Maile łącznie</p>
            <p className="text-3xl font-bold mt-1">{formatTokenCount(overview.mail_coverage.total_email_documents)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Luki (dni)</p>
            <p className="text-3xl font-bold mt-1 text-destructive">{totalGapDays}</p>
          </CardContent>
        </Card>
      </div>

      {/* Coverage timeline */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            Timeline pokrycia maili
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {overview.mail_coverage.earliest_message_day} → {overview.mail_coverage.latest_message_day}
          </p>
          <DayCoverage days={overview.mail_coverage.days.slice(0, 48)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coverage gaps */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Luki w danych
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coverageGaps.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle className="h-4 w-4" />
                Brak luk między najstarszym a najnowszym dniem
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {coverageGaps.slice(0, 20).map((gap, i) => (
                  <Badge
                    key={`${gap.from}-${i}`}
                    variant="outline"
                    className="bg-destructive/5 text-destructive border-destructive/20"
                  >
                    {formatDay(gap.from)} – {formatDay(gap.to)} ({gap.days}d)
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent ingest */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Ostatnio dodane</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.recent_documents.slice(0, 8).map((doc) => (
                <div
                  key={`${doc.title}-${doc.created_at}`}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {doc.summary ?? "Brak streszczenia"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {doc.message_day ?? "—"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quality metrics */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Wskaźniki jakości</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="font-medium">Maile bez daty źródłowej</p>
                <p className="text-2xl font-bold text-warning mt-1">
                  {formatTokenCount(overview.mail_coverage.undated_email_documents)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ten licznik ma spadać po repair
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="font-medium">Najstarszy dzień</p>
                <p className="text-lg font-bold mt-1">
                  {overview.mail_coverage.earliest_message_day ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Granica historyczna KB</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="font-medium">Najnowszy dzień</p>
                <p className="text-lg font-bold mt-1">
                  {overview.mail_coverage.latest_message_day ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Bieżąca granica wiedzy</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
