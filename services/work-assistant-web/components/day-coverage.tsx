import { formatDay } from "@/lib/format";
import type { MailCoverageDay } from "@/lib/types";
import { cn } from "@/lib/utils";

type DayCoverageProps = {
  days: MailCoverageDay[];
};

export function DayCoverage({ days }: DayCoverageProps) {
  if (!days.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Brak pokrycia dni do pokazania</p>;
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="flex flex-wrap gap-1">
      {days.map((entry) => {
        const intensity = Math.max(0.15, entry.count / maxCount);
        return (
          <div
            key={entry.day}
            className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-border text-center min-w-[3rem] cursor-default"
            title={`${entry.day}: ${entry.count} maili`}
            style={{ backgroundColor: `hsl(230 80% 60% / ${intensity})` }}
          >
            <span className="text-[10px] text-foreground/60">{formatDay(entry.day, entry.day)}</span>
            <strong className="text-xs font-semibold">{entry.count}</strong>
          </div>
        );
      })}
    </div>
  );
}
