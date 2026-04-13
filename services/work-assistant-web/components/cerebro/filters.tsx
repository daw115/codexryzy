"use client";

type SyncFilter = "all" | "pending" | "partial" | "synced" | "no_actions";

export type CerebroFiltersState = {
  query: string;
  syncFilter: SyncFilter;
  dateFrom: string;
  dateTo: string;
  category: string;
  project: string;
};

type Props = {
  filters: CerebroFiltersState;
  categoryOptions: string[];
  projectOptions: string[];
  loading: boolean;
  onChange: (patch: Partial<CerebroFiltersState>) => void;
  onApply: () => void;
  onReset: () => void;
};

export const EMPTY_FILTERS: CerebroFiltersState = {
  query: "",
  syncFilter: "all",
  dateFrom: "",
  dateTo: "",
  category: "",
  project: "",
};

export function CerebroFilters({
  filters,
  categoryOptions,
  projectOptions,
  loading,
  onChange,
  onApply,
  onReset,
}: Props) {
  return (
    <div className="cerebroFilters">
      <input
        className="fieldInput"
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
        placeholder="Szukaj po tytule, streszczeniu, ownerze..."
      />

      <div className="cerebroFilterRow">
        <select
          className="fieldInput"
          value={filters.syncFilter}
          onChange={(e) => onChange({ syncFilter: e.target.value as SyncFilter })}
        >
          <option value="all">Wszystkie statusy</option>
          <option value="pending">pending</option>
          <option value="partial">partial</option>
          <option value="synced">synced</option>
          <option value="no_actions">no_actions</option>
        </select>

        <input
          className="fieldInput"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
        />
        <input
          className="fieldInput"
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
        />

        {categoryOptions.length > 0 && (
          <select
            className="fieldInput"
            value={filters.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="">Wszystkie kategorie</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {projectOptions.length > 0 && (
          <select
            className="fieldInput"
            value={filters.project}
            onChange={(e) => onChange({ project: e.target.value })}
          >
            <option value="">Wszystkie projekty</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        <button className="primaryButton" type="button" onClick={onApply} disabled={loading}>
          {loading ? "Filtruję..." : "Szukaj"}
        </button>
        <button className="ghostButton" type="button" onClick={onReset} disabled={loading}>
          Reset
        </button>
      </div>
    </div>
  );
}
