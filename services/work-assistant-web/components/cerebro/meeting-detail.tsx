"use client";

import { formatDate } from "@/lib/format";

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

export function CerebroMeetingDetail({
  detail,
  loading,
  syncPending,
  taskPendingId,
  syncMessage,
  syncError,
  onRebuildTasks,
  onCompleteTask,
}: Props) {
  if (loading) {
    return <div className="emptyState">Wczytuję szczegóły...</div>;
  }

  if (!detail) {
    return <div className="emptyState">Wybierz spotkanie z listy.</div>;
  }

  return (
    <div className="readerPanel">
      <div className="assistantActions">
        <button
          className="primaryButton"
          type="button"
          onClick={onRebuildTasks}
          disabled={syncPending}
        >
          {syncPending ? "Synchronizuję..." : "Re-sync tasków"}
        </button>
      </div>

      {syncError && <p className="formError">{syncError}</p>}
      {syncMessage && (
        <div className="calloutCard">
          <p>{syncMessage}</p>
        </div>
      )}

      <div className="calloutCard">
        <strong>Streszczenie</strong>
        <p>{detail.summary ?? "Brak streszczenia."}</p>
      </div>

      {/* Action items */}
      <div className="sectionHeader">
        <div>
          <span className="sectionEyebrow">Action items</span>
          <h3 className="sectionTitle sectionTitleSmall">
            Do wykonania ({detail.action_items.length})
          </h3>
        </div>
      </div>
      <div className="signalList">
        {detail.action_items.length > 0 ? (
          detail.action_items.map((item, i) => (
            <article className="listCard" key={i}>
              <div className="listCardHeader">
                <h4 className="listCardTitle">{item.title}</h4>
                <span className="statusPill">{item.status ?? "open"}</span>
              </div>
              <div className="timelineMeta">
                <span>{item.owner ?? "brak ownera"}</span>
                <span>{formatDate(item.due_at, "bez terminu")}</span>
              </div>
              {item.description && <p className="listCardCopy">{item.description}</p>}
            </article>
          ))
        ) : (
          <div className="emptyState">Brak action items.</div>
        )}
      </div>

      {/* Linked tasks */}
      <div className="sectionHeader">
        <div>
          <span className="sectionEyebrow">Vikunja</span>
          <h3 className="sectionTitle sectionTitleSmall">
            Zsynchronizowane taski ({detail.tasks.length})
          </h3>
        </div>
      </div>
      <div className="signalList">
        {detail.tasks.length > 0 ? (
          detail.tasks.map((task) => (
            <article className="listCard" key={task.external_task_id}>
              <div className="listCardHeader">
                <h4 className="listCardTitle">{task.title}</h4>
                <span className="statusPill">{task.status}</span>
              </div>
              <div className="timelineMeta">
                <span>{formatDate(task.due_at, "bez terminu")}</span>
                {task.external_project_id && <span>{task.external_project_id}</span>}
              </div>
              {task.description && <p className="listCardCopy">{task.description}</p>}
              {!isDone(task.status) && (
                <div className="assistantActions">
                  <button
                    className="ghostButton"
                    type="button"
                    onClick={() => onCompleteTask(task.external_task_id)}
                    disabled={taskPendingId === task.external_task_id}
                  >
                    {taskPendingId === task.external_task_id ? "Aktualizuję..." : "Oznacz done"}
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="emptyState">Brak zlinkowanych tasków.</div>
        )}
      </div>

      {/* Deadlines */}
      {detail.deadlines.length > 0 && (
        <>
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Terminy</span>
              <h3 className="sectionTitle sectionTitleSmall">Deadlines ({detail.deadlines.length})</h3>
            </div>
          </div>
          <div className="signalList">
            {detail.deadlines.map((d, i) => (
              <article className="listCard" key={i}>
                <div className="listCardHeader">
                  <h4 className="listCardTitle">{d.label}</h4>
                  <span className="priorityPill">{formatDate(d.date, "brak daty")}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
