"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

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

const selectCls = "w-full text-sm bg-secondary border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function CerebroFilters({ filters, categoryOptions, projectOptions, loading, onChange, onApply, onReset }: Props) {
  return (
    <div className="space-y-2 mb-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10 bg-card"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
          placeholder="Szukaj po tytule, streszczeniu..."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <select className={selectCls} value={filters.syncFilter} onChange={(e) => onChange({ syncFilter: e.target.value as SyncFilter })}>
          <option value="all">Wszystkie statusy</option>
          <option value="pending">pending</option>
          <option value="partial">partial</option>
          <option value="synced">synced</option>
          <option value="no_actions">no_actions</option>
        </select>
        <Input type="date" value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} className="bg-card" />
        <Input type="date" value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} className="bg-card" />
        {categoryOptions.length > 0 && (
          <select className={selectCls} value={filters.category} onChange={(e) => onChange({ category: e.target.value })}>
            <option value="">Wszystkie kategorie</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {projectOptions.length > 0 && (
          <select className={selectCls} value={filters.project} onChange={(e) => onChange({ project: e.target.value })}>
            <option value="">Wszystkie projekty</option>
            {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={onApply} disabled={loading}>{loading ? "Filtruję..." : "Szukaj"}</Button>
        <Button size="sm" variant="outline" onClick={onReset} disabled={loading}>Reset</Button>
      </div>
    </div>
  );
}
