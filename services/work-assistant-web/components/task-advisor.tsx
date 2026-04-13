"use client";

import { useState } from "react";

import { formatDate } from "@/lib/format";
import type { AssistantQueryResponse, TaskListItem } from "@/lib/types";

type TaskAdvisorProps = {
  tasks: TaskListItem[];
};

export function TaskAdvisor({ tasks }: TaskAdvisorProps) {
  const [selectedId, setSelectedId] = useState<string>(tasks[0]?.external_task_id ?? "");
  const [response, setResponse] = useState<AssistantQueryResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTask = tasks.find((task) => task.external_task_id === selectedId) ?? null;

  async function generateAdvice() {
    if (!selectedTask) {
      setError("Wybierz zadanie.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await fetch("/api/assistant/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `Mam zadanie "${selectedTask.title}" ${
            selectedTask.due_at ? `z terminem ${selectedTask.due_at}. ` : ""
          }Powiedz krok po kroku jak je wykonac na podstawie mojej bazy wiedzy i maili. Zaznacz czego ewentualnie brakuje.`,
          search_limit: 8,
          include_tasks: true,
          max_document_contexts: 5,
          max_task_contexts: 5,
        }),
      });

      if (!result.ok) {
        throw new Error(await result.text());
      }

      const data = (await result.json()) as AssistantQueryResponse;
      setResponse(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nie udalo sie pobrac porady.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="sectionCard">
      <div className="sectionHeader">
        <div>
          <span className="sectionEyebrow">Task advisor</span>
          <h2 className="sectionTitle">AI podpowiada jak wykonac zadanie</h2>
        </div>
      </div>

      {!tasks.length ? <div className="emptyState">Brak zadan do analizy przez AI.</div> : null}

      <div className="stack">
        <select
          className="fieldInput"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={!tasks.length}
        >
          {tasks.map((task) => (
            <option key={task.external_task_id} value={task.external_task_id}>
              {task.title}
            </option>
          ))}
        </select>

        {selectedTask ? (
          <div className="calloutCard">
            <strong>{selectedTask.title}</strong>
            <p>
              Termin: {formatDate(selectedTask.due_at)} / Priorytet: {selectedTask.priority ?? "normalny"}
            </p>
          </div>
        ) : null}

        <button
          className="primaryButton"
          type="button"
          onClick={generateAdvice}
          disabled={pending || !tasks.length}
        >
          {pending ? "AI analizuje..." : "Podpowiedz jak to zrobic"}
        </button>

        {error ? <p className="formError">{error}</p> : null}

        {response ? (
          <div className="calloutCard">
            <strong>Plan wykonania</strong>
            <p>{response.answer}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
