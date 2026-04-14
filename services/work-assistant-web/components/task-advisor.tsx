"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { AssistantQueryResponse, TaskListItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles } from "lucide-react";

type TaskAdvisorProps = {
  tasks: TaskListItem[];
};

export function TaskAdvisor({ tasks }: TaskAdvisorProps) {
  const [selectedId, setSelectedId] = useState<string>(tasks[0]?.external_task_id ?? "");
  const [response, setResponse] = useState<AssistantQueryResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.external_task_id === selectedId) ?? null;

  async function generateAdvice() {
    if (!selectedTask) { setError("Wybierz zadanie."); return; }
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `Mam zadanie "${selectedTask.title}" ${selectedTask.due_at ? `z terminem ${selectedTask.due_at}. ` : ""}Powiedz krok po kroku jak je wykonać na podstawie mojej bazy wiedzy i maili. Zaznacz czego ewentualnie brakuje.`,
          search_limit: 8,
          include_tasks: true,
          max_document_contexts: 5,
          max_task_contexts: 5,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as AssistantQueryResponse;
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd porady AI");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Task Advisor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zadań do analizy</p>
        ) : (
          <>
            <select
              className="w-full text-sm bg-secondary border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setResponse(null); }}
            >
              {tasks.map((t) => (
                <option key={t.external_task_id} value={t.external_task_id}>
                  {t.title}
                </option>
              ))}
            </select>

            {selectedTask && (
              <div className="p-3 rounded-lg bg-muted/30 text-sm">
                <p className="font-medium truncate">{selectedTask.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Termin: {formatDate(selectedTask.due_at)} · Priorytet: {selectedTask.priority ?? "normalny"}
                </p>
              </div>
            )}

            <Button
              onClick={() => void generateAdvice()}
              disabled={pending || !tasks.length}
              className="w-full"
              variant="default"
            >
              {pending ? (
                "AI analizuje..."
              ) : (
                <><Sparkles className="h-3 w-3 mr-1.5" /> Podpowiedz jak to zrobić</>
              )}
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {response && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-xs font-semibold text-primary mb-2">Plan wykonania</p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{response.answer}</p>
                {response.citations.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                    {response.citations.map((c) => (
                      <Badge key={`${c.source_type}-${c.source_id}`} variant="secondary" className="text-xs">
                        {c.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
