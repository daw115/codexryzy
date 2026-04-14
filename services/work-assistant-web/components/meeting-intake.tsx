"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Users, CheckCircle } from "lucide-react";

export function MeetingIntake() {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !transcript.trim()) {
      setError("Tytuł i analiza spotkania są wymagane.");
      return;
    }
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const r = await fetch("/api/meetings/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          project,
          meeting_date: meetingDate || undefined,
          source_url: sourceUrl || undefined,
          summary: summary || undefined,
          transcript,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus("Analiza spotkania została dodana do bazy wiedzy.");
      setTitle(""); setProject(""); setMeetingDate(""); setSourceUrl(""); setSummary(""); setTranscript("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest spotkania nie udał się");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          Wczytaj spotkanie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="title">Tytuł *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint Planning Q2" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="project">Projekt</Label>
            <Input id="project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="dev-team" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="date">Data spotkania</Label>
            <Input id="date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="url">URL źródła</Label>
            <Input id="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="summary">Streszczenie</Label>
          <Textarea
            id="summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Krótkie streszczenie i główne decyzje"
            className="resize-none"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="transcript">Analiza / transkrypt *</Label>
          <Textarea
            id="transcript"
            rows={10}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Wklej analizę wygenerowaną przez inną aplikację"
            className="resize-none"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {status && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {status}
          </div>
        )}

        <Button onClick={() => void submit()} disabled={pending} className="w-full">
          {pending ? "Wczytuje..." : "Dodaj do bazy wiedzy"}
        </Button>
      </CardContent>
    </Card>
  );
}
