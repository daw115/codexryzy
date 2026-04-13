"use client";

import { useEffect, useState } from "react";

import { formatDate, formatDay } from "@/lib/format";
import type { DocumentDetailResponse, DocumentListItem } from "@/lib/types";

type MailWorkbenchProps = {
  initialDocuments: DocumentListItem[];
};

export function MailWorkbench({ initialDocuments }: MailWorkbenchProps) {
  const [documents, setDocuments] = useState<DocumentListItem[]>(initialDocuments);
  const [selectedId, setSelectedId] = useState<string | null>(initialDocuments[0]?.document_id ?? null);
  const [detail, setDetail] = useState<DocumentDetailResponse | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyDraft, setReplyDraft] = useState<string | null>(null);
  const [draftPending, setDraftPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setError(null);

    fetch(`/api/mailbox/document/${selectedId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return (await response.json()) as DocumentDetailResponse;
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Nie udalo sie pobrac maila.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const response = await fetch("/api/mailbox/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 24,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { documents: DocumentListItem[] };
      setDocuments(data.documents);
      setSelectedId(data.documents[0]?.document_id ?? null);
      setReplyDraft(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function generateDraft() {
    if (!detail) {
      return;
    }

    setDraftPending(true);
    setReplyDraft(null);
    setError(null);

    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `Przygotuj profesjonalny szkic odpowiedzi na mail "${detail.title}" na podstawie mojej bazy wiedzy, bez zmyslania faktow. Jesli brak danych, napisz czego brakuje.`,
          search_limit: 8,
          include_tasks: true,
          max_document_contexts: 5,
          max_task_contexts: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { answer: string };
      setReplyDraft(data.answer);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nie udalo sie wygenerowac odpowiedzi.");
    } finally {
      setDraftPending(false);
    }
  }

  return (
    <div className="mailWorkbench">
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Reader</span>
            <h2 className="sectionTitle">Czytaj kazdy mail i steruj odpowiedzia</h2>
          </div>
        </div>

        <div className="assistantComposer">
          <input
            className="fieldInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj po tytule, tresci, projekcie lub temacie"
          />
          <div className="assistantActions">
            <button className="primaryButton" type="button" onClick={search} disabled={searching}>
              {searching ? "Szukam..." : "Szukaj maili"}
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={() => {
                setQuery("");
                void search();
              }}
              disabled={searching}
            >
              Pokaz najnowsze
            </button>
          </div>
        </div>

        {error ? <p className="formError">{error}</p> : null}
      </section>

      <div className="mailGrid">
        <section className="sectionCard sectionCardColumn">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Lista</span>
              <h2 className="sectionTitle">Inbox knowledge base</h2>
            </div>
            <div className="sectionNote">{documents.length} pozycji</div>
          </div>

          <div className="scrollPanel">
            <div className="signalList">
              {documents.map((document) => (
                <button
                  key={document.document_id}
                  type="button"
                  className={`mailListItem${selectedId === document.document_id ? " mailListItemActive" : ""}`}
                  onClick={() => {
                    setSelectedId(document.document_id);
                    setReplyDraft(null);
                  }}
                >
                  <div className="listCardHeader">
                    <h3 className="listCardTitle">{document.title}</h3>
                    <span className="statusPill">
                      {document.message_day ? formatDay(document.message_day) : "bez daty"}
                    </span>
                  </div>
                  <p className="listCardCopy">{document.summary ?? "Brak streszczenia."}</p>
                  <div className="listCardMeta">
                    {document.category ?? "uncategorized"} / {document.priority ?? "normal"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sectionCard sectionCardColumn">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Reader</span>
              <h2 className="sectionTitle">Pelny mail i wynik analizy</h2>
            </div>
            {detail ? (
              <button className="primaryButton" type="button" onClick={generateDraft} disabled={draftPending}>
                {draftPending ? "AI pisze..." : "Wygeneruj odpowiedz"}
              </button>
            ) : null}
          </div>

          {loadingDetail ? <div className="emptyState">Laduje mail...</div> : null}
          {!loadingDetail && !detail ? <div className="emptyState">Wybierz mail z listy.</div> : null}

          {detail ? (
            <div className="readerPanel">
              <div className="miniGrid">
                <div className="miniStat">
                  <span>Kategoria</span>
                  <strong>{detail.analysis?.category ?? "uncategorized"}</strong>
                </div>
                <div className="miniStat">
                  <span>Priorytet</span>
                  <strong>{detail.analysis?.priority ?? "normal"}</strong>
                </div>
                <div className="miniStat">
                  <span>Aktualizacja</span>
                  <strong>{formatDate(detail.updated_at)}</strong>
                </div>
              </div>

              <div className="calloutCard">
                <strong>{detail.title}</strong>
                <p>{detail.analysis?.summary ?? "Brak streszczenia od analizy."}</p>
              </div>

              {detail.analysis?.action_items?.length ? (
                <div className="stack">
                  <div className="sectionHeader">
                    <div>
                      <span className="sectionEyebrow">Action items</span>
                      <h3 className="sectionTitle sectionTitleSmall">Zadania wyciagniete z maila</h3>
                    </div>
                  </div>
                  <div className="signalList">
                    {detail.analysis.action_items.map((item, index) => (
                      <article className="listCard" key={`action-${index}`}>
                        <div className="listCardHeader">
                          <h4 className="listCardTitle">{String(item.title ?? item.action ?? `Akcja ${index + 1}`)}</h4>
                          <span className="statusPill">{String(item.owner ?? "do ustalenia")}</span>
                        </div>
                        <p className="listCardCopy">{String(item.description ?? item.deadline ?? "Brak opisu")}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.tasks.length ? (
                <div className="stack">
                  <div className="sectionHeader">
                    <div>
                      <span className="sectionEyebrow">Linked tasks</span>
                      <h3 className="sectionTitle sectionTitleSmall">Taski powiazane z tym mailem</h3>
                    </div>
                  </div>
                  <div className="signalList">
                    {detail.tasks.map((task) => (
                      <article className="listCard" key={task.external_task_id}>
                        <div className="listCardHeader">
                          <h4 className="listCardTitle">{task.title}</h4>
                          <span className="priorityPill">{task.status}</span>
                        </div>
                        <div className="timelineMeta">
                          <span>{formatDate(task.due_at, "bez terminu")}</span>
                          <span>{task.external_project_id ?? "bez projektu"}</span>
                        </div>
                        {task.description ? <p className="listCardCopy">{task.description}</p> : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.analysis?.deadlines?.length ? (
                <div className="calloutCard">
                  <strong>Wykryte deadline'y</strong>
                  <p>{detail.analysis.deadlines.map((deadline) => JSON.stringify(deadline)).join(" / ")}</p>
                </div>
              ) : null}

              <div className="mailBody">
                <pre>{detail.extracted_text}</pre>
              </div>

              {replyDraft ? (
                <div className="calloutCard">
                  <strong>Szkic odpowiedzi AI</strong>
                  <p>{replyDraft}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
