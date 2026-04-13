import { DayCoverage } from "@/components/day-coverage";
import { getDashboardOverview } from "@/lib/api";
import { formatDay, formatTokenCount } from "@/lib/format";
import type { MailCoverageDay } from "@/lib/types";

export const dynamic = "force-dynamic";

type CoverageGap = {
  from: string;
  to: string;
  days: number;
};

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

  return gaps;
}

export default async function KnowledgePage() {
  const overview = await getDashboardOverview();
  const coverageGaps = buildCoverageGaps(overview.mail_coverage.days);
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
  );
}
