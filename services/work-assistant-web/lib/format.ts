export function formatDate(value: string | null | undefined, fallback = "—"): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDay(value: string | null | undefined, fallback = "—"): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function formatTokenCount(value: number | null | undefined): string {
  const safe = value ?? 0;
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1)}M`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1)}k`;
  }
  return `${safe}`;
}

export function priorityLabel(priority: number | null | undefined): string {
  return {
    1: "niski",
    2: "normalny",
    3: "wysoki",
    4: "pilny",
    5: "natychmiast",
  }[priority ?? 2] ?? "normalny";
}

export function relativeCoverageLabel(undated: number, total: number): string {
  if (!total) {
    return "brak danych";
  }

  const ratio = Math.round((undated / total) * 100);
  return `${ratio}% bez daty źródłowej`;
}
