"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MeetingIntakeResponse } from "@/lib/types";

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

// Capture a frame every 6 seconds
const FRAME_INTERVAL_MS = 6000;
// Width to scale canvas to before sending (reduces payload size)
const CAPTURE_WIDTH = 1280;
// Minimum pixel diff ratio to trigger a full analysis (0–1)
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
  // Dedup set so the same transcript line isn't added twice
  const seenLinesRef = useRef<Set<string>>(new Set());

  const stopStream = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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

    if (diff < DIFF_THRESHOLD) {
      setStatusMsg("Brak zmian na ekranie");
      return;
    }

    setFrameCount((n) => n + 1);
    setStatusMsg("Analizuję klatkę...");

    const frameDataUrl = canvas.toDataURL("image/jpeg", 0.75);

    try {
      const res = await fetch("/api/record/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: frameDataUrl }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as FrameAnalysis;

      if (data.slide_text) {
        setCurrentSlide(data.slide_text);
        setSlideTexts((prev) => {
          // Only append if content changed vs last known slide
          if (prev[prev.length - 1] === data.slide_text) return prev;
          return [...prev, data.slide_text!];
        });
      }

      if (data.transcript_lines.length > 0) {
        const fresh: string[] = [];
        for (const line of data.transcript_lines) {
          const trimmed = line.trim();
          if (trimmed && !seenLinesRef.current.has(trimmed)) {
            seenLinesRef.current.add(trimmed);
            fresh.push(trimmed);
          }
        }
        if (fresh.length > 0) {
          setTranscriptLines((prev) => [...prev, ...fresh]);
        }
      }

      setStatusMsg(`Ostatnia analiza: ${new Date().toLocaleTimeString("pl-PL")}`);
    } catch {
      setStatusMsg("Błąd analizy klatki");
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!title.trim()) {
      setError("Podaj tytuł spotkania przed rozpoczęciem.");
      return;
    }

    setError(null);
    setTranscriptLines([]);
    setSlideTexts([]);
    setCurrentSlide(null);
    setFrameCount(0);
    seenLinesRef.current = new Set();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 2, max: 5 } },
        audio: false,
      });
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setError(`Nie udało się uruchomić przechwytywania: ${err.message}`);
      }
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setRecordingState("recording");

    // If the user stops sharing via browser UI
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      stopStream();
      setRecordingState("idle");
    });

    // Start capture loop, first frame after 1s
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
        body: JSON.stringify({
          title,
          meeting_date: meetingDate,
          project: project.trim() || undefined,
          slide_texts: slideTexts,
          transcript_lines: transcriptLines,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const data = (await res.json()) as FinalizeResult;
      setResult(data);
      setRecordingState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalizacja nie powiodła się.");
      setRecordingState("idle");
    }
  }, [title, meetingDate, project, slideTexts, transcriptLines, stopStream]);

  const resetForNewRecording = useCallback(() => {
    setRecordingState("idle");
    setTitle("");
    setProject("");
    setTranscriptLines([]);
    setSlideTexts([]);
    setCurrentSlide(null);
    setFrameCount(0);
    setResult(null);
    setStatusMsg("");
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  // ── IDLE: setup form ────────────────────────────────────────────────────────
  if (recordingState === "idle") {
    return (
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Nowe nagranie</span>
            <h2 className="sectionTitle">Konfiguracja spotkania</h2>
          </div>
        </div>

        <div className="recordSetupForm">
          <div className="field">
            <label className="fieldLabel">Tytuł spotkania *</label>
            <input
              className="fieldInput"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void startRecording(); }}
              placeholder="np. Q2 Planning — Core ICCI"
            />
          </div>
          <div className="doubleGrid">
            <div className="field">
              <label className="fieldLabel">Data spotkania</label>
              <input
                className="fieldInput"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="fieldLabel">Projekt (opcjonalnie)</label>
              <input
                className="fieldInput"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="np. CCCI v4.2"
              />
            </div>
          </div>

          {error && <p className="formError">{error}</p>}

          <div className="assistantActions">
            <button className="primaryButton" type="button" onClick={() => void startRecording()}>
              Wybierz okno i start
            </button>
          </div>
        </div>

        <div className="calloutCard" style={{ marginTop: "1.5rem" }}>
          <strong>Jak to działa</strong>
          <p>
            Po kliknięciu wybierasz okno Teams. Moduł co kilka sekund analizuje zmiany — wyciąga
            tekst ze slajdów i transkrypt z czarnego paska na dole. Po zatrzymaniu AI generuje
            podsumowanie, action items i decyzje, które trafiają automatycznie do Cerebro.
          </p>
        </div>
      </section>
    );
  }

  // ── RECORDING: live view ────────────────────────────────────────────────────
  if (recordingState === "recording") {
    return (
      <div className="recordingShell">
        <section className="sectionCard">
          <div className="sectionHeader">
            <div className="recordingIndicatorRow">
              <span className="recordingDot" />
              <div>
                <span className="sectionEyebrow">Nagrywanie aktywne — {title}</span>
                <p className="recordingMeta">{frameCount} klatek · {transcriptLines.length} linii transkryptu · {statusMsg}</p>
              </div>
            </div>
            <div className="assistantActions">
              <button className="primaryButton" type="button" onClick={() => void finalize()}>
                Zakończ i analizuj
              </button>
            </div>
          </div>
          <video ref={videoRef} className="recordPreview" muted playsInline />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </section>

        <div className="doubleGrid">
          <section className="sectionCard sectionCardColumn">
            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Aktualny slajd</span>
                <h2 className="sectionTitle">Treść prezentacji</h2>
              </div>
              <span className="sectionNote">{slideTexts.length} unikalnych</span>
            </div>
            <div className="scrollPanel">
              {currentSlide ? (
                <pre className="recordSlideText">{currentSlide}</pre>
              ) : (
                <div className="emptyState">Czekam na slajd...</div>
              )}
            </div>
          </section>

          <section className="sectionCard sectionCardColumn">
            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Transkrypt Teams</span>
                <h2 className="sectionTitle">Zebrane linie</h2>
              </div>
              <span className="sectionNote">{transcriptLines.length}</span>
            </div>
            <div className="scrollPanel">
              <div className="signalList">
                {transcriptLines.length > 0 ? (
                  [...transcriptLines].reverse().map((line, i) => (
                    <p key={i} className="listCardCopy recordTranscriptLine">{line}</p>
                  ))
                ) : (
                  <div className="emptyState">Czekam na transkrypt Teams...</div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ── FINALIZING ──────────────────────────────────────────────────────────────
  if (recordingState === "finalizing") {
    return (
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">AI analizuje</span>
            <h2 className="sectionTitle">Generowanie podsumowania...</h2>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Zebrano {slideTexts.length} unikalnych slajdów i {transcriptLines.length} linii transkryptu.
          Quatarly generuje podsumowanie, action items i decyzje.
        </p>
      </section>
    );
  }

  // ── DONE: results ───────────────────────────────────────────────────────────
  if (recordingState === "done" && result) {
    const { analysis, intake } = result;
    return (
      <div className="recordingShell">
        <section className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Analiza gotowa</span>
              <h2 className="sectionTitle">{title}</h2>
            </div>
            <div className="assistantActions">
              <span className="statusPill">{intake.status === "ingested" ? "Zapisano" : "Zaktualizowano"}</span>
              <button className="ghostButton" type="button" onClick={resetForNewRecording}>
                Nowe nagranie
              </button>
            </div>
          </div>

          <div className="calloutCard">
            <strong>Podsumowanie</strong>
            <p>{analysis.summary}</p>
          </div>

          {analysis.key_topics.length > 0 && (
            <div className="assistantActions" style={{ marginTop: "0.75rem" }}>
              {analysis.key_topics.map((topic, i) => (
                <span className="pill" key={i}>{topic}</span>
              ))}
            </div>
          )}
        </section>

        <div className="doubleGrid">
          <section className="sectionCard sectionCardColumn">
            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Action items</span>
                <h2 className="sectionTitle">Zadania do wykonania</h2>
              </div>
              <span className="sectionNote">{analysis.action_items.length}</span>
            </div>
            <div className="signalList">
              {analysis.action_items.length > 0 ? (
                analysis.action_items.map((item, i) => (
                  <article className="listCard" key={i}>
                    <div className="listCardHeader">
                      <h4 className="listCardTitle">{item.title}</h4>
                      {item.due_at && <span className="priorityPill">{item.due_at}</span>}
                    </div>
                    {item.owner && (
                      <div className="timelineMeta">
                        <span>{item.owner}</span>
                      </div>
                    )}
                    {item.description && <p className="listCardCopy">{item.description}</p>}
                  </article>
                ))
              ) : (
                <div className="emptyState">Brak action items.</div>
              )}
            </div>
          </section>

          <section className="sectionCard sectionCardColumn">
            <div className="sectionHeader">
              <div>
                <span className="sectionEyebrow">Decyzje</span>
                <h2 className="sectionTitle">Podjęte decyzje</h2>
              </div>
              <span className="sectionNote">{analysis.decisions.length}</span>
            </div>
            <div className="signalList">
              {analysis.decisions.length > 0 ? (
                analysis.decisions.map((decision, i) => (
                  <article className="listCard" key={i}>
                    <p className="listCardCopy">{decision}</p>
                  </article>
                ))
              ) : (
                <div className="emptyState">Brak wykrytych decyzji.</div>
              )}
            </div>
          </section>
        </div>

        {error && <p className="formError">{error}</p>}
      </div>
    );
  }

  return null;
}
