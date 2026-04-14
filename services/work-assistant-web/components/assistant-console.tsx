"use client";

import { useRef, useEffect, useState } from "react";
import type { AssistantQueryResponse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Sparkles, Send } from "lucide-react";

type AssistantConsoleProps = {
  initialQuery?: string;
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; citations?: AssistantQueryResponse["citations"]; tasks?: AssistantQueryResponse["tasks"] };

const suggestions = [
  "Co mam pilnego do końca tygodnia?",
  "Podsumuj najważniejsze maile z bazy",
  "Na jakie maile powinienem odpowiedzieć?",
  "Jakie mam zaległe taski i jak je wykonać?",
];

export function AssistantConsole({ initialQuery = "" }: AssistantConsoleProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function submit(customQuery?: string) {
    const finalQuery = (customQuery ?? query).trim();
    if (!finalQuery) { setError("Wpisz pytanie."); return; }

    setMessages((prev) => [...prev, { role: "user", content: finalQuery }]);
    setQuery("");
    setPending(true);
    setError(null);

    try {
      const r = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery, search_limit: 8, include_tasks: true, max_document_contexts: 5, max_task_contexts: 5 }),
      });
      if (!r.ok) throw new Error(await r.text() || "Assistant request failed");
      const data = (await r.json()) as AssistantQueryResponse;
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, citations: data.citations, tasks: data.tasks }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd zapytania");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-auto space-y-4 pb-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Jak mogę Ci pomóc?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Zapytaj o cokolwiek — przeszukam Twoją bazę wiedzy
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="text-xs text-left justify-start h-auto py-2 px-3"
                  onClick={() => void submit(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] space-y-2 ${msg.role === "user" ? "items-end" : ""}`}>
              <Card className={msg.role === "user" ? "bg-primary text-primary-foreground border-0" : "bg-card"}>
                <CardContent className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </CardContent>
              </Card>
              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium pl-1">Źródła:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((c) => (
                      <Badge key={`${c.source_type}-${c.source_id}`} variant="secondary" className="text-xs">
                        {c.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary animate-pulse" />
            </div>
            <Card className="bg-card">
              <CardContent className="p-3">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <div
                      key={delay}
                      className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      {/* Input */}
      <div className="border-t border-border pt-4 shrink-0">
        <div className="flex gap-2">
          <Textarea
            placeholder="Zapytaj asystenta..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            className="resize-none bg-card min-h-[44px] max-h-32"
            rows={1}
          />
          <Button
            onClick={() => void submit()}
            disabled={!query.trim() || pending}
            size="icon"
            className="shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
