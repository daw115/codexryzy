"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingIntakeResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Video, Square, Sparkles, CheckCircle } from "lucide-react";

type RecordingState = "idle" | "recording" | "finalizing" | "done";

type FrameAnalysis = {
  slide_text: string | null;
  transcript_lines: string[];
};

type ActionItem = {
  title: string;
  owner: string | null;
  due_at: string | null;
  description: string | null;
};

type MeetingAnalysis = {
  summary: string;
  action_items: ActionItem[];
  decisions: string[];
  key_topics: string[];
};

type FinalizeResult = {
  analysis: MeetingAnalysis;
  intake: MeetingIntakeResponse;
};

const FRAME_INTERVAL_MS = 6000;
const CAPTURE_WIDTH = 1280;
const DIFF_THRESHOLD = 0.025;

function computePixelDiff(prev: ImageData, curr: ImageData): number {
  const step = 40;
  let diff = 0;
  let samples = 0;
  for (let i = 0; i < prev.data.length; i += step * 4) {
    diff += Math.abs(prev.data[i] - curr.data[i]);
    diff += Math.abs(prev.data[i + 1] - curr.data[i + 1]);
    diff += Math.abs(prev.data[i + 2] - curr.data[i + 2]);
    samples++;
  }
  return diff / (samples * 3 * 255);
}

export function RecordingConsole() {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split("T")[0]);
  const [project, setProject] = useState("");
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [slideTexts, setSlideTexts] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResult | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const seenLinesRef = useRef<Set<string>>(new Set());

  const stopStream = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    prevFrameRef.current = null;
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    const aspectRatio = video.videoHeight > 0 ? video.videoHeight / video.videoWidth : 9 / 16;
    canvas.width = CAPTURE_WIDTH;
    canvas.height = Math.round(CAPTURE_WIDTH * aspectRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const diff = prevFrameRef.current ? computePixelDiff(prevFrameRef.current, currFrame) : 1;
    prevFrameRef.current = currFrame;
    if (diff < DIFF_THRESHOLD) { setStatusMsg("Brak zmian na ekranie"); return; }
    setFrameCount((n) => n + 1);
    setStatusMsg("Analizuję klatkę...");
    const frameDataUrl = canvas.toDataURL("image/jpeg", 0.75);
    try {
      const res = await fetch("/api/record/analyze-frame", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame: frameDataUrl }) });
      if (!res.ok) return;
      const data = (await res.json()) as FrameAnalysis;
      if (data.slide_text) {
        setCurrentSlide(data.slide_text);
        setSlideTexts((prev) => prev[prev.length - 1] === data.slide_text ? prev : [...prev, data.slide_text!]);
      }
      if (data.transcript_lines.length > 0) {
        const fresh: string[] = [];
        for (const line of data.transcript_lines) {
          const trimmed = line.trim();
          if (trimmed && !seenLinesRef.current.has(trimmed)) { seenLinesRef.current.add(trimmed); fresh.push(trimmed); }
        }
        if (fresh.length > 0) setTranscriptLines((prev) => [...prev, ...fresh]);
      }
      setStatusMsg(`Analiza: ${new Date().toLocaleTimeString("pl-PL")}`);
    } catch { setStatusMsg("Błąd analizy klatki"); }
  }, []);

  const startRecording = useCallback(async () => {
    if (!title.trim()) { setError("Podaj tytuł spotkania."); return; }
    setError(null);
    setTranscriptLines([]); setSlideTexts([]); setCurrentSlide(null); setFrameCount(0);
    seenLinesRef.current = new Set();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 2, max: 5 } }, audio: false });
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") setError(`Nie udało się: ${err.message}`);
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    setRecordingState("recording");
    stream.getVideoTracks()[0].addEventListener("ended", () => { stopStream(); setRecordingState("idle"); });
    setTimeout(() => void captureAndAnalyze(), 1000);
    intervalRef.current = setInterval(() => void captureAndAnalyze(), FRAME_INTERVAL_MS);
  }, [title, captureAndAnalyze, stopStream]);

  const finalize = useCallback(async () => {
    stopStream();
    setRecordingState("finalizing");
    setError(null);
    try {
      const res = await fetch("/api/record/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, meeting_date: meetingDate, project: project.trim() || undefined, slide_texts: slideTexts, transcript_lines: transcriptLines }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult((await res.json()) as FinalizeResult);
      setRecordingState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalizacja nie powiodła się.");
      setRecordingState("idle");
    }
  }, [title, meetingDate, project, slideTexts, transcriptLines, stopStream]);

  const resetForNewRecording = useCallback(() => {
    setRecordingState("idle"); setTitle(""); setProject("");
    setTranscriptLines([]); setSlideTexts([]); setCurrentSlide(null);
    setFrameCount(0); setResult(null); setStatusMsg(""); setError(null);
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  // IDLE
  if (recordingState === "idle") {
    return (
      <Card className="bg-card border-border max-w-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Konfiguracja nagrania</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rec-title">Tytuł spotkania *</Label>
            <Input
              id="rec-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void startRecording(); }}
              placeholder="np. Q2 Planning — Core ICCI"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rec-date">Data</Label>
              <Input id="rec-date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-project">Projekt</Label>
              <Input id="rec-project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="np. CCCI v4.2" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => void startRecording()} className="w-full">
            <Video className="h-4 w-4 mr-2" /> Wybierz okno i start
          </Button>
          <div className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
            <strong className="text-foreground">Jak to działa:</strong> Wybierasz okno Teams. Moduł co kilka sekund analizuje zmiany — wyciąga tekst ze slajdów i transkrypt. Po zakończeniu AI generuje podsumowanie i action items.
          </div>
        </CardContent>
      </Card>
    );
  }

  // RECORDING
  if (recordingState === "recording") {
    return (
      <div className="space-y-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{frameCount} klatek · {transcriptLines.length} linii · {statusMsg}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => void finalize()}>
                <Square className="h-3 w-3 mr-1" /> Zakończ i analizuj
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <video ref={videoRef} className="w-full rounded-lg max-h-48 bg-black" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Aktualny slajd ({slideTexts.length})</CardTitle></CardHeader>
            <CardContent>
              {currentSlide ? (
                <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80 max-h-40 overflow-y-auto">{currentSlide}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">Czekam na slajd...</p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Transkrypt ({transcriptLines.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {transcriptLines.length > 0
                  ? [...transcriptLines].reverse().map((line, i) => <p key={i} className="text-xs text-muted-foreground">{line}</p>)
                  : <p className="text-sm text-muted-foreground">Czekam na transkrypt...</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // FINALIZING
  if (recordingState === "finalizing") {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <Sparkles className="h-12 w-12 text-primary mx-auto mb-3 animate-pulse" />
          <p className="font-medium">AI analizuje spotkanie...</p>
          <p className="text-sm text-muted-foreground mt-1">
            {slideTexts.length} slajdów · {transcriptLines.length} linii transkryptu
          </p>
        </CardContent>
      </Card>
    );
  }

  // DONE
  if (recordingState === "done" && result) {
    const { analysis, intake } = result;
    return (
      <div className="space-y-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                <CardTitle>{title}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  {intake.status === "ingested" ? "Zapisano" : "Zaktualizowano"}
                </Badge>
                <Button size="sm" variant="outline" onClick={resetForNewRecording}>Nowe nagranie</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-3">
              <p className="text-xs font-semibold text-primary mb-1">Podsumowanie</p>
              <p className="text-sm text-foreground/80">{analysis.summary}</p>
            </div>
            {analysis.key_topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.key_topics.map((t, i) => <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Action Items ({analysis.action_items.length})</CardTitle></CardHeader>
            <CardContent>
              {analysis.action_items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak action items</p>
              ) : (
                <div className="space-y-2">
                  {analysis.action_items.map((item, i) => (
                    <div key={i} className="p-2.5 rounded border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{item.title}</p>
                        {item.due_at && <Badge variant="outline" className="text-xs shrink-0">{item.due_at}</Badge>}
                      </div>
                      {item.owner && <p className="text-xs text-muted-foreground mt-0.5">{item.owner}</p>}
                      {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Decyzje ({analysis.decisions.length})</CardTitle></CardHeader>
            <CardContent>
              {analysis.decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak wykrytych decyzji</p>
              ) : (
                <div className="space-y-2">
                  {analysis.decisions.map((d, i) => (
                    <p key={i} className="text-sm text-foreground/80 p-2 rounded border border-border">{d}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}
