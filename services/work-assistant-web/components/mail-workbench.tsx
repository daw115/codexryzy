"use client";

import { useEffect, useState } from "react";
import { formatDate, formatDay } from "@/lib/format";
import type { DocumentDetailResponse, DocumentListItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mail, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

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
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as DocumentDetailResponse;
      })
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Błąd pobierania"); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const r = await fetch("/api/mailbox/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 24 }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { documents: DocumentListItem[] };
      setDocuments(data.documents);
      setSelectedId(data.documents[0]?.document_id ?? null);
      setReplyDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function generateDraft() {
    if (!detail) return;
    setDraftPending(true);
    setReplyDraft(null);
    setError(null);
    try {
      const r = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `Przygotuj profesjonalny szkic odpowiedzi na mail "${detail.title}" na podstawie mojej bazy wiedzy, bez zmyslania faktow. Jesli brak danych, napisz czego brakuje.`,
          search_limit: 8,
          include_tasks: true,
          max_document_contexts: 5,
          max_task_contexts: 5,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { answer: string };
      setReplyDraft(data.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd generowania odpowiedzi");
    } finally {
      setDraftPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 bg-card"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="Szukaj po tytule, treści, projekcie..."
          />
        </div>
        <Button onClick={() => void search()} disabled={searching} variant="default">
          {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Szukaj"}
        </Button>
        <Button
          onClick={() => { setQuery(""); void search(); }}
          disabled={searching}
          variant="outline"
        >
          Najnowsze
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {documents.map((doc) => (
            <Card
              key={doc.document_id}
              className={cn(
                "cursor-pointer transition-colors hover:border-primary/30",
                selectedId === doc.document_id
                  ? "border-primary bg-primary/5"
                  : "bg-card",
              )}
              onClick={() => { setSelectedId(doc.document_id); setReplyDraft(null); }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {doc.summary ?? "Brak streszczenia"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {doc.message_day ? formatDay(doc.message_day) : "—"}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {doc.category ?? "—"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {loadingDetail ? (
            <Card className="bg-card">
              <CardContent className="p-12 text-center text-muted-foreground text-sm">
                Ładuję mail...
              </CardContent>
            </Card>
          ) : !detail ? (
            <Card className="bg-card">
              <CardContent className="p-12 text-center text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Wybierz mail z listy</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base leading-snug">{detail.title}</CardTitle>
                  <Button size="sm" onClick={generateDraft} disabled={draftPending}>
                    {draftPending ? (
                      <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> AI pisze...</>
                    ) : (
                      <><Sparkles className="h-3 w-3 mr-1" /> Odpowiedz</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Metadata chips */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{detail.analysis?.category ?? "uncategorized"}</Badge>
                  <Badge variant="outline">{detail.analysis?.priority ?? "normal"}</Badge>
                  <Badge variant="secondary">{formatDate(detail.updated_at)}</Badge>
                </div>

                {/* Summary */}
                {detail.analysis?.summary && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-xs font-semibold text-primary mb-1">Podsumowanie AI</p>
                    <p className="text-sm text-foreground/80">{detail.analysis.summary}</p>
                  </div>
                )}

                {/* Action items */}
                {detail.analysis?.action_items?.length ? (
                  <div className="p-3 rounded-lg bg-warning/5 border border-warning/10">
                    <p className="text-xs font-semibold text-warning mb-2">Action Items</p>
                    <ul className="space-y-1">
                      {detail.analysis.action_items.map((item, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex gap-2">
                          <span className="text-warning shrink-0">›</span>
                          <span>
                            <strong>{String(item.title ?? item.action ?? `Akcja ${i + 1}`)}</strong>
                            {Boolean(item.description || item.deadline) && (
                              <span className="text-muted-foreground"> · {String(item.description ?? item.deadline)}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Linked tasks */}
                {detail.tasks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Powiązane taski ({detail.tasks.length})</p>
                    <div className="space-y-1.5">
                      {detail.tasks.map((task) => (
                        <div key={task.external_task_id} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30">
                          <p className="text-xs truncate">{task.title}</p>
                          <Badge variant="outline" className="text-xs shrink-0">{task.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reply draft */}
                {replyDraft && (
                  <div className="p-3 rounded-lg bg-success/5 border border-success/20">
                    <p className="text-xs font-semibold text-success mb-2">Szkic odpowiedzi AI</p>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{replyDraft}</p>
                  </div>
                )}

                {/* Raw body */}
                {detail.extracted_text && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Treść maila</p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                      {detail.extracted_text}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
