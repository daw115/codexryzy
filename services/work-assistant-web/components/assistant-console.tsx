"use client";

import { useState } from "react";

import type { AssistantQueryResponse } from "@/lib/types";

type AssistantConsoleProps = {
  title?: string;
  description?: string;
  initialQuery?: string;
};

export function AssistantConsole({
  title = "AI Copilot",
  description = "Pytaj o maile, dokumenty, zadania i zaleznosci miedzy nimi.",
  initialQuery = "",
}: AssistantConsoleProps) {
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<AssistantQueryResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(customQuery?: string) {
    const finalQuery = (customQuery ?? query).trim();
    if (!finalQuery) {
      setError("Wpisz pytanie do AI.");
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
          query: finalQuery,
          search_limit: 8,
          include_tasks: true,
          max_document_contexts: 5,
          max_task_contexts: 5,
        }),
      });

      if (!result.ok) {
        const body = await result.text();
        throw new Error(body || "Assistant request failed");
      }

      const data = (await result.json()) as AssistantQueryResponse;
      setResponse(data);
      setQuery(finalQuery);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Assistant request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="sectionCard">
      <div className="sectionHeader">
        <div>
          <span className="sectionEyebrow">{title}</span>
          <h2 className="sectionTitle">Chat AI z wiedza z bazy</h2>
        </div>
      </div>

      <p className="sectionBodyCopy">{description}</p>

      <div className="assistantComposer">
        <textarea
          className="assistantInput"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Np. Co mam pilnego do konca tygodnia i jak powinienem na to odpowiedziec?"
          rows={5}
        />
        <div className="assistantActions">
          <button className="primaryButton" type="button" onClick={() => submit()} disabled={pending}>
            {pending ? "AI pracuje..." : "Zapytaj AI"}
          </button>
          <button
            className="ghostButton"
            type="button"
            onClick={() =>
              submit("Co mam do zrobienia do konca tygodnia i na jakie maile powinienem odpowiedziec?")
            }
            disabled={pending}
          >
            Quick prompt
          </button>
        </div>
      </div>

      {error ? <p className="formError">{error}</p> : null}

      {response ? (
        <div className="assistantResult">
          <div className="calloutCard">
            <strong>Odpowiedz</strong>
            <p>{response.answer}</p>
          </div>

          <div className="doubleGrid">
            <div className="sectionCard sectionInset">
              <div className="sectionHeader">
                <div>
                  <span className="sectionEyebrow">Citations</span>
                  <h3 className="sectionTitle sectionTitleSmall">Zrodla</h3>
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
                  <div className="emptyState">Brak cytowan dla tej odpowiedzi.</div>
                )}
              </div>
            </div>

            <div className="sectionCard sectionInset">
              <div className="sectionHeader">
                <div>
                  <span className="sectionEyebrow">Retrieved tasks</span>
                  <h3 className="sectionTitle sectionTitleSmall">Task context</h3>
                </div>
              </div>
              <div className="signalList">
                {response.tasks.length ? (
                  response.tasks.map((task) => (
                    <article className="listCard" key={task.external_task_id}>
                      <div className="listCardHeader">
                        <h4 className="listCardTitle">{task.title}</h4>
                        <span className="statusPill">{task.status}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="emptyState">Ta odpowiedz nie potrzebowala task context.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
