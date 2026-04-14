"use client";

import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, Circle, Brain } from "lucide-react";

export type MeetingActionItem = {
  title: string;
  owner: string | null;
  due_at: string | null;
  status: string | null;
  description: string | null;
};

export type MeetingDeadline = {
  label: string;
  date: string | null;
};

export type MeetingTask = {
  external_task_id: string;
  external_project_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: number | null;
  status: string;
};

export type MeetingDetail = {
  document_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  priority: string | null;
  updated_at: string;
  action_items: MeetingActionItem[];
  deadlines: MeetingDeadline[];
  open_questions: string[];
  tasks: MeetingTask[];
};

function isDone(status: string | null): boolean {
  if (!status) return false;
  const v = status.toLowerCase();
  return v.includes("done") || v.includes("complete") || v.includes("zrobione");
}

type Props = {
  detail: MeetingDetail | null;
  loading: boolean;
  syncPending: boolean;
  taskPendingId: string | null;
  syncMessage: string | null;
  syncError: string | null;
  onRebuildTasks: () => void;
  onCompleteTask: (taskId: string) => void;
};

export function CerebroMeetingDetail({ detail, loading, syncPending, taskPendingId, syncMessage, syncError, onRebuildTasks, onCompleteTask }: Props) {
  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Wczytuję szczegóły...</p>;
  }
  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Brain className="h-10 w-10 opacity-20 mb-2" />
        <p className="text-sm">Wybierz spotkanie z listy</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-20rem)]">
      <Button size="sm" onClick={onRebuildTasks} disabled={syncPending} variant="outline">
        <RefreshCw className={`h-3 w-3 mr-1 ${syncPending ? "animate-spin" : ""}`} />
        {syncPending ? "Synchronizuję..." : "Re-sync tasków"}
      </Button>

      {syncError && <p className="text-sm text-destructive">{syncError}</p>}
      {syncMessage && <div className="p-3 rounded-lg bg-success/5 border border-success/20 text-sm text-success">{syncMessage}</div>}

      {/* Summary */}
      {detail.summary && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-xs font-semibold text-primary mb-1">Streszczenie</p>
          <p className="text-sm text-foreground/80">{detail.summary}</p>
        </div>
      )}

      {/* Action items */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Action Items ({detail.action_items.length})
        </p>
        {detail.action_items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak action items</p>
        ) : (
          <div className="space-y-2">
            {detail.action_items.map((item, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-border bg-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <Badge variant="secondary" className="text-xs shrink-0">{item.status ?? "open"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {item.owner ?? "brak ownera"} · {formatDate(item.due_at, "bez terminu")}
                </div>
                {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Vikunja Tasks ({detail.tasks.length})
        </p>
        {detail.tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak zlinkowanych tasków</p>
        ) : (
          <div className="space-y-2">
            {detail.tasks.map((task) => (
              <div key={task.external_task_id} className="p-2.5 rounded-lg border border-border bg-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{task.title}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {isDone(task.status)
                      ? <CheckCircle className="h-4 w-4 text-success" />
                      : <Circle className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(task.due_at, "bez terminu")}
                  {task.external_project_id && ` · ${task.external_project_id}`}
                </p>
                {!isDone(task.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs mt-1 px-2"
                    onClick={() => onCompleteTask(task.external_task_id)}
                    disabled={taskPendingId === task.external_task_id}
                  >
                    {taskPendingId === task.external_task_id ? "Aktualizuję..." : "Oznacz done"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deadlines */}
      {detail.deadlines.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Deadlines ({detail.deadlines.length})
          </p>
          <div className="space-y-1.5">
            {detail.deadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded border border-border text-sm">
                <span>{d.label}</span>
                <Badge variant="outline" className="text-xs">{formatDate(d.date, "brak daty")}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
