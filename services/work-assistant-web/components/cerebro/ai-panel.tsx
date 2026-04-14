"use client";

import { useState } from "react";
import type { AssistantCitation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles } from "lucide-react";

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
      const r = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: prompt, search_limit: 10, include_tasks: true, max_document_contexts: 6, max_task_contexts: 8 }),
      });
      if (!r.ok) throw new Error(await r.text());
      setResponse((await r.json()) as AssistantResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zapytanie nie powiodło się");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 flex flex-col h-full">
      <Textarea
        rows={4}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Np. Ułóż plan realizacji po kolei na podstawie spotkań z ostatnich 2 tygodni."
        className="resize-none bg-card"
      />
      <div className="flex gap-2">
        <Button onClick={() => void ask()} disabled={pending} size="sm">
          {pending ? "Analizuję..." : <><Sparkles className="h-3 w-3 mr-1" /> Zapytaj AI</>}
        </Button>
        {selectedTitle && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuery(`Dla spotkania "${selectedTitle}" wyznacz kolejność działań i zaproponuj harmonogram.`)}
          >
            Prompt dla wybranego
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {response && (
        <div className="space-y-3 flex-1 overflow-y-auto">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs font-semibold text-primary mb-2">Odpowiedź</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{response.answer}</p>
          </div>
          {response.citations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Źródła ({response.citations.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {response.citations.map((c) => (
                  <Badge key={`${c.source_type}-${c.source_id}`} variant="secondary" className="text-xs">
                    {c.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!response && !pending && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Zadaj pytanie — AI odpowie na podstawie Twojej bazy wiedzy
        </p>
      )}
    </div>
  );
}
