import { DayCoverage } from "@/components/day-coverage";
import { getDashboardOverview } from "@/lib/api";
import { formatDay, formatTokenCount } from "@/lib/format";
<<<<<<< HEAD
=======
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Database, AlertCircle, CheckCircle } from "lucide-react";
>>>>>>> origin/main
import type { MailCoverageDay } from "@/lib/types";

export const dynamic = "force-dynamic";

<<<<<<< HEAD
type CoverageGap = {
  from: string;
  to: string;
  days: number;
};
=======
type CoverageGap = { from: string; to: string; days: number };
>>>>>>> origin/main

function toUtcDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
<<<<<<< HEAD

=======
>>>>>>> origin/main
function addUtcDays(day: Date, amount: number): Date {
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}
<<<<<<< HEAD

function toDayIso(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function diffUtcDays(startIso: string, endIso: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((toUtcDay(endIso).getTime() - toUtcDay(startIso).getTime()) / msPerDay);
}

function buildCoverageGaps(days: MailCoverageDay[]): CoverageGap[] {
  if (days.length < 2) {
    return [];
  }
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const gaps: CoverageGap[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const diff = diffUtcDays(previous.day, current.day);
    if (diff <= 1) {
      continue;
    }
    const from = toDayIso(addUtcDays(toUtcDay(previous.day), 1));
    const to = toDayIso(addUtcDays(toUtcDay(current.day), -1));
    gaps.push({ from, to, days: diff - 1 });
  }

=======
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
>>>>>>> origin/main
  return gaps;
}

export default async function KnowledgePage() {
  const overview = await getDashboardOverview();
  const coverageGaps = buildCoverageGaps(overview.mail_coverage.days);
<<<<<<< HEAD
  const totalGapDays = coverageGaps.reduce((sum, gap) => sum + gap.days, 0);

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Knowledge organization</span>
            <h1 className="pageTitleCompact">Kategorie, projekty i pokrycie archiwum</h1>
          </div>
          <div className="heroChipRow">
            <span className="pageTag">
              <strong>{overview.mail_coverage.covered_days_count}</strong> dni
            </span>
            <span className="pageTag">
              <strong>{formatTokenCount(overview.mail_coverage.undated_email_documents)}</strong> bez daty
            </span>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Tu sprawdzasz, czy maile sa juz sensownie ukladae w kategorie i czy archiwum ma ciaglosc
          potrzebna do pytan historycznych oraz pracy projektowej.
        </p>
      </section>

      <section className="rangeBand">
        <article className="rangeCard">
          <span>Zakres wiedzy</span>
          <strong>
            {overview.mail_coverage.earliest_message_day ?? "brak"} -{" "}
            {overview.mail_coverage.latest_message_day ?? "brak"}
          </strong>
        </article>
        <article className="rangeCard">
          <span>Pokryte dni</span>
          <strong>{overview.mail_coverage.covered_days_count}</strong>
        </article>
        <article className="rangeCard">
          <span>Calosc maili</span>
          <strong>{formatTokenCount(overview.mail_coverage.total_email_documents)}</strong>
        </article>
        <article className="rangeCard">
          <span>Dni bez danych (w zakresie)</span>
          <strong>{formatTokenCount(totalGapDays)}</strong>
        </article>
      </section>

      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Coverage timeline</span>
            <h2 className="sectionTitle">Dni juz obecne w bazie</h2>
          </div>
          <div className="sectionNote">
            od {overview.mail_coverage.earliest_message_day} do {overview.mail_coverage.latest_message_day}
          </div>
        </div>
        <DayCoverage days={overview.mail_coverage.days.slice(0, 48)} />
      </section>

      <section className="doubleGrid">
        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Coverage gaps</span>
              <h2 className="sectionTitle">Luki dni w bazie</h2>
            </div>
            <div className="sectionNote">{coverageGaps.length} przedziałów</div>
          </div>

          {coverageGaps.length ? (
            <div className="signalList">
              {coverageGaps.slice(0, 20).map((gap, index) => (
                <article className="listCard" key={`${gap.from}-${gap.to}-${index}`}>
                  <div className="listCardHeader">
                    <h3 className="listCardTitle">
                      {formatDay(gap.from, gap.from)} - {formatDay(gap.to, gap.to)}
                    </h3>
                    <span className="statusPill">{gap.days} dni</span>
                  </div>
                  <p className="listCardCopy">
                    Te dni nie mają jeszcze maili w bazie. Po imporcie archiwum ta lista powinna
                    maleć.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyState">Brak luk między najstarszym a najnowszym dniem.</div>
          )}
        </article>

        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Recent ingest</span>
              <h2 className="sectionTitle">Ostatnio dodane dokumenty</h2>
            </div>
          </div>

          <div className="signalList">
            {overview.recent_documents.slice(0, 10).map((document) => (
              <article className="listCard" key={`${document.title}-${document.created_at}`}>
                <div className="listCardHeader">
                  <h3 className="listCardTitle">{document.title}</h3>
                  <span className="statusPill">
                    {document.message_day ?? `Drive ${document.source_modified_label ?? "?"}`}
                  </span>
                </div>
                <p className="listCardCopy">{document.summary ?? "Brak streszczenia"}</p>
                <div className="listCardMeta">
                  {document.category ?? "uncategorized"} / {document.priority ?? "normal"}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Quality</span>
              <h2 className="sectionTitle">Najwazniejsze wskazniki</h2>
            </div>
          </div>

          <div className="stack">
            <div className="calloutCard">
              <strong>
                Maili bez daty zrodlowej:{" "}
                {formatTokenCount(overview.mail_coverage.undated_email_documents)}
              </strong>
              <p className="sectionBodyCopy">
                Ten licznik ma spadac, gdy repair odzyskuje prawdziwe naglowki i daty z plikow
                `.msg`.
              </p>
            </div>
            <div className="calloutCard">
              <strong>
                Najstarszy rozpoznany dzien: {overview.mail_coverage.earliest_message_day}
              </strong>
              <p className="sectionBodyCopy">
                To mowi, od ktorego momentu archiwum jest juz reprezentowane w bazie w sposob
                uzyteczny dla pytan historycznych.
              </p>
            </div>
            <div className="calloutCard">
              <strong>
                Najnowszy rozpoznany dzien: {overview.mail_coverage.latest_message_day}
              </strong>
              <p className="sectionBodyCopy">
                To granica, do ktorej mozesz bezpiecznie zakladac, ze system zna juz biezace watki
                z maili.
              </p>
            </div>
          </div>
        </article>
      </section>
    </>
=======
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
>>>>>>> origin/main
  );
}
