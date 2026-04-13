"use client";

import { useEffect, useState } from "react";

import type {
  AssistantCitation,
  CerebroMeetingDigest,
  MeetingBulkSyncResponse,
  MeetingTaskRebuildResponse,
  TaskActionResponse,
} from "@/lib/types";
import { formatDate } from "@/lib/format";

type CerebroWorkbenchProps = {
  meetings: CerebroMeetingDigest[];
};

type AssistantResponse = {
  answer: string;
  citations: AssistantCitation[];
};

type SyncFilter = "all" | "pending" | "partial" | "synced" | "no_actions";

type FilterState = {
  query: string;
  syncFilter: SyncFilter;
  dateFrom: string;
  dateTo: string;
  category: string;
  project: string;
};

type CerebroQueryResponse = {
  meetings: CerebroMeetingDigest[];
};

function isActionDone(status: string | null): boolean {
  if (!status) {
    return false;
  }
  const value = status.toLowerCase();
  return value.includes("done") || value.includes("complete") || value.includes("zrobione");
}

export function CerebroWorkbench({ meetings }: CerebroWorkbenchProps) {
  const [localMeetings, setLocalMeetings] = useState<CerebroMeetingDigest[]>(meetings);
  const [query, setQuery] = useState("");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [selectedId, setSelectedId] = useState<string>(meetings[0]?.document_id ?? "");
  const [assistantQuery, setAssistantQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [opsMessage, setOpsMessage] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalMeetings(meetings);
  }, [meetings]);

  useEffect(() => {
    if (!localMeetings.length) {
      if (selectedId) {
        setSelectedId("");
      }
      return;
    }
    if (!selectedId || !localMeetings.some((meeting) => meeting.document_id === selectedId)) {
      setSelectedId(localMeetings[0].document_id);
    }
  }, [localMeetings, selectedId]);

  const filteredMeetings = localMeetings;
  const selectedMeeting =
    filteredMeetings.find((meeting) => meeting.document_id === selectedId) ?? filteredMeetings[0] ?? null;
  const actionItems = filteredMeetings.flatMap((meeting) => meeting.action_items);
  const openActionItems = actionItems.filter((item) => !isActionDone(item.status));
  const completedActionItems = actionItems.filter((item) => isActionDone(item.status));
  const totalDeadlines = filteredMeetings.reduce((sum, meeting) => sum + meeting.deadlines.length, 0);
  const categoryOptions = Array.from(
    new Set(localMeetings.map((meeting) => meeting.category).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b, "pl"));
  const projectOptions = Array.from(
    new Set(localMeetings.map((meeting) => meeting.project).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b, "pl"));

  function buildQueryString(filters: FilterState): string {
    const search = new URLSearchParams();
    search.set("limit", "60");
    if (filters.syncFilter !== "all") {
      search.set("sync_status", filters.syncFilter);
    }
    if (filters.dateFrom) {
      search.set("date_from", filters.dateFrom);
    }
    if (filters.dateTo) {
      search.set("date_to", filters.dateTo);
    }
    if (filters.category) {
      search.set("category", filters.category);
    }
    if (filters.project) {
      search.set("project", filters.project);
    }
    const phrase = filters.query.trim();
    if (phrase) {
      search.set("search_text", phrase);
    }
    return search.toString();
  }

  async function reloadMeetings(overrides?: Partial<FilterState>) {
    const filters: FilterState = {
      query,
      syncFilter,
      dateFrom,
      dateTo,
      category,
      project,
      ...overrides,
    };
    const queryString = buildQueryString(filters);

    setQueryError(null);
    setRefreshPending(true);
    try {
      const result = await fetch(`/api/cerebro/query?${queryString}`);
      if (!result.ok) {
        throw new Error(await result.text());
      }
      const data = (await result.json()) as CerebroQueryResponse;
      setLocalMeetings(data.meetings);
      if (selectedId && !data.meetings.some((meeting) => meeting.document_id === selectedId)) {
        setSelectedId(data.meetings[0]?.document_id ?? "");
      }
    } catch (requestError) {
      setQueryError(requestError instanceof Error ? requestError.message : "Nie udało się odświeżyć listy spotkań.");
    } finally {
      setRefreshPending(false);
    }
  }

  async function askAssistant() {
    const fallbackPrompt = selectedMeeting
      ? `Przeanalizuj spotkanie "${selectedMeeting.title}". Ułóż plan wykonania action items po kolei, wskaż terminy i ryzyka. Odpowiadaj wyłącznie na podstawie mojej bazy wiedzy.`
      : "Podsumuj najważniejsze zadania i terminy ze spotkań z bazy wiedzy i ułóż plan działania.";
    const finalPrompt = assistantQuery.trim() || fallbackPrompt;

    setPending(true);
    setAssistantError(null);
    setResponse(null);

    try {
      const result = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: finalPrompt,
          search_limit: 10,
          include_tasks: true,
          max_document_contexts: 6,
          max_task_contexts: 8,
        }),
      });

      if (!result.ok) {
        throw new Error(await result.text());
      }

      const data = (await result.json()) as AssistantResponse;
      setResponse(data);
    } catch (requestError) {
      setAssistantError(requestError instanceof Error ? requestError.message : "Zapytanie do AI nie powiodło się.");
    } finally {
      setPending(false);
    }
  }

  function deriveSyncStatus(actionItems: number, vikunjaSynced: number) {
    if (actionItems <= 0) {
      return "no_actions";
    }
    if (vikunjaSynced <= 0) {
      return "pending";
    }
    if (vikunjaSynced < actionItems) {
      return "partial";
    }
    return "synced";
  }

  async function rebuildSelectedMeetingTasks() {
    if (!selectedMeeting) {
      return;
    }

    setOpsError(null);
    setOpsMessage(null);
    setActionPendingId(`sync:${selectedMeeting.document_id}`);

    try {
      const result = await fetch(`/api/cerebro/rebuild-tasks/${selectedMeeting.document_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!result.ok) {
        throw new Error(await result.text());
      }
      const data = (await result.json()) as MeetingTaskRebuildResponse;
      setLocalMeetings((prev) =>
        prev.map((meeting) =>
          meeting.document_id === selectedMeeting.document_id
            ? {
                ...meeting,
                mirrored_tasks_count: data.mirrored_tasks,
                sync_status: deriveSyncStatus(data.action_items_detected, data.vikunja_synced),
              }
            : meeting,
        ),
      );
      setOpsMessage(
        `Task sync zakończony. mirrored=${data.mirrored_tasks}, vikunja=${data.vikunja_synced}${
          data.sync_errors.length ? `, errors=${data.sync_errors.length}` : ""
        }`,
      );
      await reloadMeetings();
    } catch (requestError) {
      setOpsError(requestError instanceof Error ? requestError.message : "Re-sync tasków nie powiódł się.");
    } finally {
      setActionPendingId(null);
    }
  }

  async function completeTask(documentId: string, externalTaskId: string) {
    setOpsError(null);
    setOpsMessage(null);
    setActionPendingId(`task:${externalTaskId}`);

    try {
      const result = await fetch(`/api/cerebro/tasks/${encodeURIComponent(externalTaskId)}/complete`, {
        method: "POST",
      });
      if (!result.ok) {
        throw new Error(await result.text());
      }
      const data = (await result.json()) as TaskActionResponse;
      setLocalMeetings((prev) =>
        prev.map((meeting) => {
          if (meeting.document_id !== documentId) {
            return meeting;
          }
          const tasks = meeting.tasks.map((task) =>
            task.external_task_id === externalTaskId ? { ...task, status: data.status } : task,
          );
          const openCount = tasks.filter((task) => !isActionDone(task.status)).length;
          return {
            ...meeting,
            tasks,
            open_tasks_count: openCount,
          };
        }),
      );
      setOpsMessage(`Zadanie "${data.title}" oznaczone jako ${data.status}.`);
      await reloadMeetings();
    } catch (requestError) {
      setOpsError(requestError instanceof Error ? requestError.message : "Nie udało się oznaczyć zadania.");
    } finally {
      setActionPendingId(null);
    }
  }

  async function bulkSyncPending() {
    setOpsError(null);
    setOpsMessage(null);
    setActionPendingId("bulk-sync");

    try {
      const result = await fetch("/api/cerebro/sync-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 100,
          date_from: dateFrom || null,
          date_to: dateTo || null,
        }),
      });
      if (!result.ok) {
        throw new Error(await result.text());
      }
      const data = (await result.json()) as MeetingBulkSyncResponse;
      const byDocumentId = new Map(data.items.map((item) => [item.document_id, item]));
      setLocalMeetings((prev) =>
        prev.map((meeting) => {
          const synced = byDocumentId.get(meeting.document_id);
          if (!synced) {
            return meeting;
          }
          return {
            ...meeting,
            mirrored_tasks_count: synced.mirrored_tasks,
            sync_status: deriveSyncStatus(synced.action_items_detected, synced.vikunja_synced),
          };
        }),
      );
      setOpsMessage(
        `Bulk sync: processed=${data.processed}, synced=${data.synced}, with_errors=${data.with_errors}`,
      );
      await reloadMeetings();
    } catch (requestError) {
      setOpsError(requestError instanceof Error ? requestError.message : "Bulk sync nie powiódł się.");
    } finally {
      setActionPendingId(null);
    }
  }

  return (
    <div className="cerebroGrid">
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Meeting intelligence</span>
            <h2 className="sectionTitle">Backlog spotkań</h2>
          </div>
          <div className="assistantActions">
            <div className="sectionNote">{filteredMeetings.length} analiz</div>
            <button
              className="ghostButton"
              type="button"
              onClick={() => {
                void reloadMeetings();
              }}
              disabled={refreshPending}
            >
              {refreshPending ? "Odświeżam..." : "Odśwież listę"}
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={bulkSyncPending}
              disabled={actionPendingId === "bulk-sync"}
            >
              {actionPendingId === "bulk-sync" ? "Sync..." : "Bulk sync pending"}
            </button>
          </div>
        </div>

        <div className="statsGrid statsGridCerebro">
          <article className="miniStat">
            <span>Spotkania</span>
            <strong>{filteredMeetings.length}</strong>
          </article>
          <article className="miniStat">
            <span>Open actions</span>
            <strong>{openActionItems.length}</strong>
          </article>
          <article className="miniStat">
            <span>Done actions</span>
            <strong>{completedActionItems.length}</strong>
          </article>
          <article className="miniStat">
            <span>Deadline'y</span>
            <strong>{totalDeadlines}</strong>
          </article>
        </div>

        <div className="assistantComposer">
          <input
            className="fieldInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void reloadMeetings();
              }
            }}
            placeholder="Szukaj po tytule, streszczeniu, ownerze, action item..."
          />
          <div className="assistantActions">
            <select
              className="fieldInput"
              value={syncFilter}
              onChange={(event) =>
                setSyncFilter(event.target.value as SyncFilter)
              }
            >
              <option value="all">Wszystkie statusy sync</option>
              <option value="pending">pending</option>
              <option value="partial">partial</option>
              <option value="synced">synced</option>
              <option value="no_actions">no_actions</option>
            </select>
            <input
              className="fieldInput"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <input
              className="fieldInput"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
            <select
              className="fieldInput"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Wszystkie kategorie</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="fieldInput"
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="">Wszystkie projekty</option>
              {projectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              className="primaryButton"
              type="button"
              onClick={() => {
                void reloadMeetings();
              }}
              disabled={refreshPending}
            >
              {refreshPending ? "Filtruję..." : "Zastosuj filtry"}
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={() => {
                setSyncFilter("all");
                setDateFrom("");
                setDateTo("");
                setQuery("");
                setCategory("");
                setProject("");
                void reloadMeetings({
                  query: "",
                  syncFilter: "all",
                  dateFrom: "",
                  dateTo: "",
                  category: "",
                  project: "",
                });
              }}
            >
              Reset filtrów
            </button>
          </div>
        </div>
        {queryError ? <p className="formError">{queryError}</p> : null}

        <div className="scrollPanel">
          <div className="signalList">
            {filteredMeetings.map((meeting) => (
              <button
                key={meeting.document_id}
                className={`mailListItem${selectedMeeting?.document_id === meeting.document_id ? " mailListItemActive" : ""}`}
                type="button"
                onClick={() => setSelectedId(meeting.document_id)}
              >
                <div className="listCardHeader">
                  <h3 className="listCardTitle">{meeting.title}</h3>
                  <span className="statusPill">{meeting.sync_status}</span>
                </div>
                <p className="listCardCopy">{meeting.summary ?? "Brak streszczenia."}</p>
                <div className="timelineMeta">
                  <span>{meeting.meeting_day ?? formatDate(meeting.updated_at)}</span>
                  <span>{meeting.action_items.length} actions</span>
                  <span>{meeting.open_tasks_count} open tasków</span>
                </div>
              </button>
            ))}
            {!filteredMeetings.length ? <div className="emptyState">Brak spotkań pasujących do filtra.</div> : null}
          </div>
        </div>
      </section>

      <section className="sectionCard sectionCardColumn">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Actions and deadlines</span>
            <h2 className="sectionTitle">{selectedMeeting ? selectedMeeting.title : "Wybierz spotkanie"}</h2>
          </div>
          <div className="sectionNote">
            {selectedMeeting ? `${selectedMeeting.action_items.length} actions / ${selectedMeeting.sync_status}` : "—"}
          </div>
        </div>

        {!selectedMeeting ? (
          <div className="emptyState">Wybierz spotkanie z backlogu.</div>
        ) : (
          <div className="readerPanel">
            <div className="assistantActions">
              <button
                className="primaryButton"
                type="button"
                onClick={rebuildSelectedMeetingTasks}
                disabled={actionPendingId === `sync:${selectedMeeting.document_id}`}
              >
                {actionPendingId === `sync:${selectedMeeting.document_id}` ? "Synchronizuję..." : "Re-sync tasków"}
              </button>
            </div>

            {opsError ? <p className="formError">{opsError}</p> : null}
            {opsMessage ? (
              <div className="calloutCard">
                <strong>Sync status</strong>
                <p>{opsMessage}</p>
              </div>
            ) : null}

            <div className="calloutCard">
              <strong>Streszczenie</strong>
              <p>{selectedMeeting.summary ?? "Brak streszczenia dla tego spotkania."}</p>
              <p>
                Sync: {selectedMeeting.sync_status} / mirrored: {selectedMeeting.mirrored_tasks_count} / open:{" "}
                {selectedMeeting.open_tasks_count}
              </p>
            </div>

            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Action items</span>
                <h3 className="sectionTitle sectionTitleSmall">Do wykonania</h3>
              </div>
            </div>
            <div className="signalList">
              {selectedMeeting.action_items.length ? (
                selectedMeeting.action_items.map((item, index) => (
                  <article className="listCard" key={`action-${selectedMeeting.document_id}-${index}`}>
                    <div className="listCardHeader">
                      <h4 className="listCardTitle">{item.title}</h4>
                      <span className="statusPill">{item.status ?? "open"}</span>
                    </div>
                    <div className="timelineMeta">
                      <span>{item.owner ?? "owner: brak"}</span>
                      <span>{formatDate(item.due_at, "bez terminu")}</span>
                    </div>
                    {item.description ? <p className="listCardCopy">{item.description}</p> : null}
                  </article>
                ))
              ) : (
                <div className="emptyState">Brak action items w analizie.</div>
              )}
            </div>

            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Linked tasks</span>
                <h3 className="sectionTitle sectionTitleSmall">Taski zsynchronizowane z Vikunja</h3>
              </div>
            </div>
            <div className="signalList">
              {selectedMeeting.tasks.length ? (
                selectedMeeting.tasks.map((task) => (
                  <article className="listCard" key={`task-${task.external_task_id}`}>
                    <div className="listCardHeader">
                      <h4 className="listCardTitle">{task.title}</h4>
                      <span className="statusPill">{task.status}</span>
                    </div>
                    <div className="timelineMeta">
                      <span>{formatDate(task.due_at, "bez terminu")}</span>
                      <span>{task.external_project_id ?? "bez projektu"}</span>
                    </div>
                    {task.description ? <p className="listCardCopy">{task.description}</p> : null}
                    {!isActionDone(task.status) ? (
                      <div className="assistantActions">
                        <button
                          className="ghostButton"
                          type="button"
                          onClick={() => completeTask(selectedMeeting.document_id, task.external_task_id)}
                          disabled={actionPendingId === `task:${task.external_task_id}`}
                        >
                          {actionPendingId === `task:${task.external_task_id}` ? "Aktualizuję..." : "Oznacz done"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="emptyState">Brak zlinkowanych tasków.</div>
              )}
            </div>

            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Deadlines</span>
                <h3 className="sectionTitle sectionTitleSmall">Terminy</h3>
              </div>
            </div>
            <div className="signalList">
              {selectedMeeting.deadlines.length ? (
                selectedMeeting.deadlines.map((deadline, index) => (
                  <article className="listCard" key={`deadline-${selectedMeeting.document_id}-${index}`}>
                    <div className="listCardHeader">
                      <h4 className="listCardTitle">{deadline.label}</h4>
                      <span className="priorityPill">{formatDate(deadline.date, "brak daty")}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="emptyState">Brak wykrytych deadline'ów.</div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="sectionCard sectionCardColumn">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Cerebro AI (Quatarly)</span>
            <h2 className="sectionTitle">Pytania do spotkań i plan pracy</h2>
          </div>
        </div>

        <div className="assistantComposer">
          <textarea
            className="assistantInput"
            rows={6}
            value={assistantQuery}
            onChange={(event) => setAssistantQuery(event.target.value)}
            placeholder="Np. Ułóż plan realizacji zadań po kolei na podstawie wszystkich spotkań z ostatnich 2 tygodni."
          />
          <div className="assistantActions">
            <button className="primaryButton" type="button" onClick={askAssistant} disabled={pending}>
              {pending ? "Quatarly analizuje..." : "Zapytaj AI"}
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={() => {
                if (!selectedMeeting) {
                  return;
                }
                setAssistantQuery(
                  `Dla spotkania "${selectedMeeting.title}" wyznacz kolejność działań, przypisz ownerów i zaproponuj harmonogram do kalendarza.`,
                );
              }}
              disabled={!selectedMeeting}
            >
              Prompt dla wybranego spotkania
            </button>
          </div>
        </div>

        {assistantError ? <p className="formError">{assistantError}</p> : null}

        {response ? (
          <div className="readerPanel">
            <div className="calloutCard">
              <strong>Odpowiedź AI</strong>
              <p>{response.answer}</p>
            </div>
            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Citations</span>
                <h3 className="sectionTitle sectionTitleSmall">Źródła</h3>
              </div>
            </div>
            <div className="signalList">
              {response.citations.length ? (
                response.citations.map((citation) => (
                  <article className="listCard" key={`${citation.source_type}-${citation.source_id}`}>
                    <div className="listCardHeader">
                      <h4 className="listCardTitle">{citation.title}</h4>
                      <span className="statusPill">{citation.label}</span>
                    </div>
                    <p className="listCardCopy">{citation.excerpt ?? "Brak fragmentu."}</p>
                  </article>
                ))
              ) : (
                <div className="emptyState">Brak cytowań w odpowiedzi.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="emptyState">
            Zadaj pytanie, a moduł użyje Quatarly przez `assistant/query` nad Twoją bazą wiedzy.
          </div>
        )}
      </section>
    </div>
  );
}
