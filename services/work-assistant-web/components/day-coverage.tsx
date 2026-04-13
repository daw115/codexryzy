import { formatDay } from "@/lib/format";
import type { MailCoverageDay } from "@/lib/types";

type DayCoverageProps = {
  days: MailCoverageDay[];
};

export function DayCoverage({ days }: DayCoverageProps) {
  if (!days.length) {
    return <div className="emptyState">Brak pokrycia dni do pokazania.</div>;
  }

  const maxCount = Math.max(...days.map((entry) => entry.count), 1);

  return (
    <div className="coverageGrid">
      {days.map((entry) => {
        const level = Math.max(0.22, entry.count / maxCount);
        return (
          <article
            key={entry.day}
            className="coverageTile"
            style={{ ["--level" as never]: `${level}` }}
            title={`${entry.day}: ${entry.count} maili`}
          >
            <span className="coverageDay">{formatDay(entry.day, entry.day)}</span>
            <strong className="coverageCount">{entry.count}</strong>
          </article>
        );
      })}
    </div>
  );
}
