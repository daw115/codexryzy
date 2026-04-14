"use client";

import { useCallback, useEffect, useState } from "react";
import { CerebroAIPanel } from "@/components/cerebro/ai-panel";
import { EMPTY_FILTERS, CerebroFilters } from "@/components/cerebro/filters";
import type { CerebroFiltersState } from "@/components/cerebro/filters";
import { CerebroMeetingDetail } from "@/components/cerebro/meeting-detail";
import type { MeetingDetail } from "@/components/cerebro/meeting-detail";
import { CerebroMeetingList } from "@/components/cerebro/meeting-list";
import type { MeetingQueryItem, MeetingBulkSyncResponse, MeetingTaskRebuildResponse, TaskActionResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Brain } from "lucide-react";

type Props = { initialMeetings: MeetingQueryItem[] };

function buildQueryString(f: CerebroFiltersState, limit = 60): string {
  const p = new URLSearchParams({ limit: String(limit) });
  if (f.syncFilter !== "all") p.set("sync_status", f.syncFilter);
  if (f.dateFrom) p.set("date_from", f.dateFrom);
  if (f.dateTo) p.set("date_to", f.dateTo);
  if (f.category) p.set("category", f.category);
  if (f.project) p.set("project", f.project);
  if (f.query.trim()) p.set("search_text", f.query.trim());
  return p.toString();
}

export function CerebroWorkbench({ initialMeetings }: Props) {
  const [meetings, setMeetings] = useState<MeetingQueryItem[]>(initialMeetings);
  const [filters, setFilters] = useState<CerebroFiltersState>(EMPTY_FILTERS);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(initialMeetings[0]?.document_id ?? "");
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [syncPending, setSyncPending] = useState(false);
  const [taskPendingId, setTaskPendingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const categoryOptions = Array.from(new Set(meetings.map((m) => m.category).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, "pl"));
  const projectOptions = Array.from(new Set(meetings.map((m) => m.project).filter((p): p is string => Boolean(p)))).sort((a, b) => a.localeCompare(b, "pl"));
  const selectedMeeting = meetings.find((m) => m.document_id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetail(null);
    setDetailLoading(true);
    setSyncMessage(null);
    setSyncError(null);
    fetch(`/api/cerebro/detail/${encodeURIComponent(selectedId)}`)
      .then(async (res) => { if (!res.ok) throw new Error(await res.text()); return res.json() as Promise<MeetingDetail>; })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const reloadList = useCallback(async (overrides?: Partial<CerebroFiltersState>) => {
    const merged = { ...filters, ...overrides };
    setListError(null);
    setListLoading(true);
    try {
      const res = await fetch(`/api/cerebro/query?${buildQueryString(merged)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { meetings: MeetingQueryItem[] };
      setMeetings(data.meetings);
      if (selectedId && !data.meetings.some((m) => m.document_id === selectedId)) {
        setSelectedId(data.meetings[0]?.document_id ?? "");
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Nie udało się odświeżyć.");
    } finally {
      setListLoading(false);
    }
  }, [filters, selectedId]);

  async function rebuildTasks() {
    if (!selectedId) return;
    setSyncPending(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch(`/api/cerebro/rebuild-tasks/${encodeURIComponent(selectedId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as MeetingTaskRebuildResponse;
      setSyncMessage(`Sync: ${data.mirrored_tasks} tasków, ${data.vikunja_synced} w Vikunja.`);
      const detailRes = await fetch(`/api/cerebro/detail/${encodeURIComponent(selectedId)}`);
      if (detailRes.ok) setDetail((await detailRes.json()) as MeetingDetail);
      await reloadList();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Re-sync nie powiódł się.");
    } finally {
      setSyncPending(false);
    }
  }

  async function completeTask(taskId: string) {
    setTaskPendingId(taskId);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch(`/api/cerebro/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as TaskActionResponse;
      setSyncMessage(`Zadanie "${data.title}" → ${data.status}.`);
      setDetail((prev) =>
        prev ? { ...prev, tasks: prev.tasks.map((t) => t.external_task_id === taskId ? { ...t, status: data.status } : t) } : prev,
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Nie udało się oznaczyć.");
    } finally {
      setTaskPendingId(null);
    }
  }

  async function bulkSync() {
    setBulkPending(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/cerebro/sync-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as MeetingBulkSyncResponse;
      setSyncMessage(`Bulk sync: ${data.processed} przetworzonych, ${data.synced} zsync.`);
      await reloadList();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Bulk sync nie powiódł się.");
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Column 1: List */}
      <Card className="bg-card border-border flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Backlog spotkań ({meetings.length})</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void reloadList()} disabled={listLoading}>
                <RefreshCw className={`h-3 w-3 ${listLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" variant="outline" onClick={bulkSync} disabled={bulkPending}>
                {bulkPending ? "Sync..." : "Bulk sync"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-18rem)]">
          <CerebroFilters
            filters={filters}
            categoryOptions={categoryOptions}
            projectOptions={projectOptions}
            loading={listLoading}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            onApply={() => void reloadList()}
            onReset={() => { setFilters(EMPTY_FILTERS); void reloadList(EMPTY_FILTERS); }}
          />
          {listError && <p className="text-sm text-destructive">{listError}</p>}
          {syncError && <p className="text-sm text-destructive">{syncError}</p>}
          {syncMessage && <div className="p-2 rounded-lg bg-success/5 border border-success/20 text-xs text-success">{syncMessage}</div>}
          <CerebroMeetingList meetings={meetings} selectedId={selectedId} onSelect={setSelectedId} />
        </CardContent>
      </Card>

      {/* Column 2: Detail */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            {selectedMeeting?.title ?? "Wybierz spotkanie"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CerebroMeetingDetail
            detail={detail}
            loading={detailLoading}
            syncPending={syncPending}
            taskPendingId={taskPendingId}
            syncMessage={null}
            syncError={null}
            onRebuildTasks={rebuildTasks}
            onCompleteTask={completeTask}
          />
        </CardContent>
      </Card>

      {/* Column 3: AI */}
      <Card className="bg-card border-border flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cerebro AI</CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <CerebroAIPanel selectedTitle={selectedMeeting?.title ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
