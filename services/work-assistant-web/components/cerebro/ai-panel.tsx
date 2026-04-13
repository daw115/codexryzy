"use client";

import { useState } from "react";

import type { AssistantCitation } from "@/lib/types";

type AssistantResponse = {
  answer: string;
  citations: AssistantCitation[];
};

type Props = {
  selectedTitle: string | null;
};

export function CerebroAIPanel({ selectedTitle }: Props) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const fallback = selectedTitle
      ? `Przeanalizuj spotkanie "${selectedTitle}". Ułóż plan wykonania action items po kolei, wskaż terminy i ryzyka.`
      : "Podsumuj najważniejsze zadania i terminy ze spotkań z bazy wiedzy i ułóż plan działania.";
    const prompt = query.trim() || fallback;

    setPending(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: prompt,
          search_limit: 10,
          include_tasks: true,
          max_document_contexts: 6,
          max_task_contexts: 8,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      setResponse((await res.json()) as AssistantResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zapytanie do AI nie powiodło się.");
    } finally {
      setPending(false);
    }
  }

  function prefillForSelected() {
    if (!selectedTitle) return;
    setQuery(
      `Dla spotkania "${selectedTitle}" wyznacz kolejność działań, przypisz ownerów i zaproponuj harmonogram.`,
    );
  }

  return (
    <>
      <div className="assistantComposer">
        <textarea
          className="assistantInput"
          rows={5}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Np. Ułóż plan realizacji zadań po kolei na podstawie wszystkich spotkań z ostatnich 2 tygodni."
        />
        <div className="assistantActions">
          <button className="primaryButton" type="button" onClick={ask} disabled={pending}>
            {pending ? "Analizuję..." : "Zapytaj AI"}
          </button>
          {selectedTitle && (
            <button className="ghostButton" type="button" onClick={prefillForSelected}>
              Prompt dla wybranego
            </button>
          )}
        </div>
      </div>

      {error && <p className="formError">{error}</p>}

      {response && (
        <div className="readerPanel">
          <div className="calloutCard">
            <strong>Odpowiedź</strong>
            <p>{response.answer}</p>
          </div>

          {response.citations.length > 0 && (
            <>
              <div className="sectionHeader">
                <span className="sectionEyebrow">Źródła ({response.citations.length})</span>
              </div>
              <div className="signalList">
                {response.citations.map((c) => (
                  <article className="listCard" key={`${c.source_type}-${c.source_id}`}>
                    <div className="listCardHeader">
                      <h4 className="listCardTitle">{c.title}</h4>
                      <span className="statusPill">{c.label}</span>
                    </div>
                    {c.excerpt && <p className="listCardCopy">{c.excerpt}</p>}
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!response && !pending && (
        <div className="emptyState">
          Zadaj pytanie — AI odpowie na podstawie Twojej bazy wiedzy.
        </div>
      )}
    </>
  );
}
