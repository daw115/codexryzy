import { useState, useEffect, useCallback } from "react";
import { Scissors, Merge, Loader2, Check, AlertCircle, ScanText, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PdfSlidesUploader from "@/components/PdfSlidesUploader";
import { getOCRWorker, terminateOCRWorker, ocrCaptionBar, ocrSlideContent, parseCaptionText } from "@/lib/local-ocr";
import { dedupeCaptionEntries, aggregateTranscripts, type TranscriptLine, type SlideDescription } from "@/lib/local-aggregation";

interface Props {
  meetingId: string;
  hasFrames: boolean;
  recordingFilename: string;
  onComplete?: (result: any) => void;
}

type Step = "idle" | "crop-split" | "ocr-captions" | "describe-slides" | "aggregate";

const stepConfig: Record<"crop-split" | "ocr-captions" | "describe-slides" | "aggregate", { label: string; description: string; icon: typeof Scissors; stepNum: number }> = {
  "crop-split": {
    label: "Deduplikuj klatki",
    description: "Hashuje klatki i usuwa duplikaty (lokalnie w przeglądarce)",
    icon: Scissors,
    stepNum: 3,
  },
  "ocr-captions": {
    label: "OCR napisów (lokalne)",
    description: "Odczytuje napisy Tesseract.js — lokalnie w przeglądarce",
    icon: ScanText,
    stepNum: 4,
  },
  "describe-slides": {
    label: "OCR slajdów (lokalne)",
    description: "Odczytuje tekst ze slajdów Tesseract.js — lokalnie",
    icon: ScanText,
    stepNum: 5,
  },
  aggregate: {
    label: "Agreguj transkrypcję (lokalne)",
    description: "Łączy audio + OCR + slajdy algorytmem lokalnym",
    icon: Merge,
    stepNum: 6,
  },
};

// Crop presentation area from Teams layout and hash pixel data for dedup
const CROP_REGION = { xPct: 0.13, yPct: 0.12, wPct: 0.42, hPct: 0.60 };

function hashCroppedSlide(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { xPct, yPct, wPct, hPct } = CROP_REGION;
      const sx = Math.round(img.width * xPct);
      const sy = Math.round(img.height * yPct);
      const sw = Math.round(img.width * wPct);
      const sh = Math.round(img.height * hPct);

      const scale = 64 / Math.max(sw, sh);
      const cw = Math.round(sw * scale);
      const ch = Math.round(sh * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);

      const pixels = ctx.getImageData(0, 0, cw, ch).data;
      let hash = 5381;
      for (let i = 0; i < pixels.length; i += 16) {
        hash = ((hash << 5) + hash + pixels[i]) | 0;
        hash = ((hash << 5) + hash + pixels[i + 1]) | 0;
        hash = ((hash << 5) + hash + pixels[i + 2]) | 0;
      }
      URL.revokeObjectURL(img.src);
      resolve(hash.toString(36));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to decode image"));
    };
    img.src = URL.createObjectURL(blob);
  });
}

function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SlideTranscriptionButton({ meetingId, hasFrames, recordingFilename, onComplete }: Props) {
  const [runningStep, setRunningStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, any>>({});
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  // Step 3: Client-side frame deduplication (unchanged)
  async function runLocalDedup() {
    setError(null);
    setRunningStep("crop-split");
    setBatchProgress("Ładowanie listy klatek...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowano");

      const stem = recordingFilename.replace(/\.[^.]+$/, "");
      const { data: allDirs } = await supabase.storage
        .from("recordings")
        .list(`${user.id}/frames`);

      const dirPrefixes = [`${user.id}/frames/${stem}`];
      if (allDirs) {
        for (const d of allDirs) {
          if (d.name.startsWith(stem + "_part") || d.name.startsWith(stem + "_sub")) {
            dirPrefixes.push(`${user.id}/frames/${d.name}`);
          }
        }
      }

      const allFrames: { path: string; timestamp: number }[] = [];
      for (const prefix of dirPrefixes) {
        const { data: files } = await supabase.storage
          .from("recordings")
          .list(prefix, { limit: 200, sortBy: { column: "name", order: "asc" } });
        if (files) {
          for (const f of files) {
            if (!f.name.match(/\.(jpg|jpeg|png)$/i)) continue;
            const m = f.name.match(/frame_(\d+)/);
            allFrames.push({ path: `${prefix}/${f.name}`, timestamp: m ? parseInt(m[1]) : 0 });
          }
        }
      }

      allFrames.sort((a, b) => a.timestamp - b.timestamp);
      if (allFrames.length === 0) throw new Error("Brak klatek — najpierw wygeneruj klatki");

      setBatchProgress(`Znaleziono ${allFrames.length} klatek, deduplikuję...`);

      const seenHashes = new Map<string, number>();
      const uniqueFrames: { path: string; timestamp: number; ts_formatted: string }[] = [];

      for (let i = 0; i < allFrames.length; i++) {
        const frame = allFrames[i];
        if (i % 10 === 0) {
          setBatchProgress(`${i + 1}/${allFrames.length} klatek, ${uniqueFrames.length} unikalnych`);
        }
        const { data: blob } = await supabase.storage.from("recordings").download(frame.path);
        if (!blob) continue;
        const frameHash = await hashCroppedSlide(blob);
        const tsFormatted = formatTs(frame.timestamp);
        if (!seenHashes.has(frameHash)) {
          seenHashes.set(frameHash, frame.timestamp);
          uniqueFrames.push({ path: frame.path, timestamp: frame.timestamp, ts_formatted: tsFormatted });
        }
      }

      setBatchProgress(`Zapisuję wynik: ${uniqueFrames.length} unikalnych z ${allFrames.length}...`);

      await (supabase as any).from("meeting_analyses").delete()
        .eq("meeting_id", meetingId).eq("source", "crop-split");

      const cropData = {
        unique_slides: uniqueFrames,
        caption_crops: allFrames.map(f => ({ path: f.path, timestamp: f.timestamp, ts_formatted: formatTs(f.timestamp) })),
        total_frames: allFrames.length,
        total_unique_slides: uniqueFrames.length,
        total_captions: allFrames.length,
      };

      const { error: saveErr } = await (supabase as any).from("meeting_analyses").insert({
        meeting_id: meetingId,
        source: "crop-split",
        analysis_json: cropData,
      });
      if (saveErr) throw new Error("Błąd zapisu: " + saveErr.message);

      setCompletedSteps(prev => ({ ...prev, "crop-split": { cropSplit: cropData } }));
      onComplete?.({ cropSplit: cropData });
      toast.success(`Krok 3: ${uniqueFrames.length} unikalnych klatek z ${allFrames.length}`);
    } catch (err: any) {
      setError(err.message || "Nieznany błąd");
      toast.error("Błąd: " + (err.message || "nieznany"));
    } finally {
      setRunningStep("idle");
      setBatchProgress(null);
    }
  }

  // Step 4: LOCAL OCR of caption bars using Tesseract.js
  async function runLocalOCR() {
    setError(null);
    setRunningStep("ocr-captions");
    setBatchProgress("Ładowanie danych crop-split...");

    try {
      // Load crop-split data
      const { data: cropAnalysis } = await (supabase as any)
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", "crop-split")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cropData = cropAnalysis?.analysis_json;
      if (!cropData?.caption_crops?.length) {
        throw new Error("Najpierw uruchom deduplikację klatek (krok 3)");
      }

      const captionCrops = cropData.caption_crops as { path: string; timestamp: number; ts_formatted: string }[];

      // Initialize Tesseract worker
      const worker = await getOCRWorker((msg) => setBatchProgress(msg));
      setBatchProgress(`OCR: 0/${captionCrops.length} klatek`);

      const allEntries: TranscriptLine[] = [];
      const allSpeakers = new Set<string>();

      for (let i = 0; i < captionCrops.length; i++) {
        const cap = captionCrops[i];
        if (i % 5 === 0) {
          setBatchProgress(`OCR: ${i + 1}/${captionCrops.length} klatek`);
        }

        try {
          const { data: blob } = await supabase.storage.from("recordings").download(cap.path);
          if (!blob) continue;

          const result = await ocrCaptionBar(blob, worker);
          if (result.text && result.confidence > 20) {
            const parsed = parseCaptionText(result.text, cap.ts_formatted);
            for (const entry of parsed) {
              allEntries.push(entry);
              if (entry.speaker !== "Mówca") allSpeakers.add(entry.speaker);
            }
          }
        } catch {
          // Skip failed frames
        }
      }

      // Deduplicate
      const deduped = dedupeCaptionEntries(allEntries);
      const speakers = Array.from(allSpeakers);
      const transcript = deduped.map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join("\n");

      const ocrResult = {
        transcript,
        entries: deduped,
        total_entries: deduped.length,
        speakers_identified: speakers,
        processed_frames: captionCrops.length,
        frames_total: captionCrops.length,
        has_more: false,
        next_offset: null,
      };

      // Save to DB
      await (supabase as any).from("meeting_analyses").delete()
        .eq("meeting_id", meetingId).eq("source", "captions-ocr");
      await (supabase as any).from("meeting_analyses").insert({
        meeting_id: meetingId,
        source: "captions-ocr",
        analysis_json: ocrResult,
      });

      setCompletedSteps(prev => ({ ...prev, "ocr-captions": { captions: ocrResult } }));
      onComplete?.({ captions: ocrResult });
      toast.success(`Krok 4: ${deduped.length} wypowiedzi z ${captionCrops.length} klatek (lokalne OCR)`);
    } catch (err: any) {
      setError(err.message || "Nieznany błąd");
      toast.error("Błąd: " + (err.message || "nieznany"));
    } finally {
      setRunningStep("idle");
      setBatchProgress(null);
    }
  }

  // Step 5b: LOCAL OCR of slide content using Tesseract.js
  async function runLocalSlideOCR() {
    setError(null);
    setRunningStep("describe-slides");
    setBatchProgress("Ładowanie slajdów...");

    try {
      // Check pdf-slides first, then crop-split
      const { data: pdfAnalysis } = await (supabase as any)
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", "pdf-slides")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: cropAnalysis } = await (supabase as any)
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", "crop-split")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const slideSource = pdfAnalysis?.analysis_json?.unique_slides?.length
        ? pdfAnalysis.analysis_json
        : cropAnalysis?.analysis_json;

      if (!slideSource?.unique_slides?.length) {
        throw new Error("Wgraj PDF lub uruchom deduplikację klatek");
      }

      const slides = slideSource.unique_slides as { path: string; timestamp: number; ts_formatted: string }[];

      const worker = await getOCRWorker((msg) => setBatchProgress(msg));
      setBatchProgress(`Slajdy: 0/${slides.length}`);

      const slideDescs: any[] = [];

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (i % 3 === 0) {
          setBatchProgress(`Slajdy: ${i + 1}/${slides.length}`);
        }

        try {
          const { data: blob } = await supabase.storage.from("recordings").download(slide.path);
          if (!blob) continue;

          const result = await ocrSlideContent(blob, worker);
          slideDescs.push({
            timestamp: slide.ts_formatted,
            slide_title: result.slide_title,
            content: result.content,
            key_info: result.key_info,
            context: "",
          });
        } catch {
          // Skip failed slides
        }
      }

      const mergedResult = {
        slides: slideDescs,
        presentation_summary: `${slideDescs.length} slajdów przetworzonych lokalnie (Tesseract.js OCR)`,
        processed_slides: slides.length,
        slides_total: slides.length,
        has_more: false,
        next_offset: null,
      };

      await (supabase as any).from("meeting_analyses").delete()
        .eq("meeting_id", meetingId).eq("source", "slide-descriptions");
      await (supabase as any).from("meeting_analyses").insert({
        meeting_id: meetingId,
        source: "slide-descriptions",
        analysis_json: mergedResult,
      });

      setCompletedSteps(prev => ({ ...prev, "describe-slides": { slideDescriptions: mergedResult } }));
      onComplete?.({ slideDescriptions: mergedResult });
      toast.success(`Krok 5b: ${slideDescs.length} opisów slajdów (lokalne OCR)`);
    } catch (err: any) {
      setError(err.message || "Nieznany błąd");
      toast.error("Błąd: " + (err.message || "nieznany"));
    } finally {
      setRunningStep("idle");
      setBatchProgress(null);
    }
  }

  // Step 6: LOCAL aggregation using JS algorithm
  async function runLocalAggregate() {
    setError(null);
    setRunningStep("aggregate");
    setBatchProgress("Ładowanie danych...");

    try {
      // Load audio transcript lines
      const { data: transcriptLines } = await supabase
        .from("transcript_lines")
        .select("timestamp, speaker, text, line_order")
        .eq("meeting_id", meetingId)
        .order("line_order", { ascending: true })
        .limit(500);

      const audioLines: TranscriptLine[] = (transcriptLines || []).map(l => ({
        timestamp: l.timestamp,
        speaker: l.speaker,
        text: l.text,
      }));

      // Load OCR captions
      const { data: ocrAnalysis } = await (supabase as any)
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", "captions-ocr")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const ocrEntries: TranscriptLine[] = (ocrAnalysis?.analysis_json?.entries || []).map((e: any) => ({
        timestamp: e.timestamp,
        speaker: e.speaker,
        text: e.text,
      }));

      // Load slide descriptions
      const { data: slideAnalysis } = await (supabase as any)
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", "slide-descriptions")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const slideDescs: SlideDescription[] = (slideAnalysis?.analysis_json?.slides || []).map((s: any) => ({
        timestamp: s.timestamp,
        slide_title: s.slide_title,
        content: s.content,
        key_info: s.key_info || "",
      }));

      if (audioLines.length === 0 && ocrEntries.length === 0) {
        throw new Error("Brak transkryptu — najpierw transkrybuj audio lub uruchom OCR");
      }

      setBatchProgress("Agregacja lokalna...");

      // Run local aggregation
      const result = aggregateTranscripts({
        audioLines,
        ocrCaptionEntries: ocrEntries,
        slideDescriptions: slideDescs,
      });

      // Save as merged analysis
      await (supabase as any).from("meeting_analyses").delete()
        .eq("meeting_id", meetingId).eq("source", "merged");
      await (supabase as any).from("meeting_analyses").insert({
        meeting_id: meetingId,
        source: "merged",
        analysis_json: result,
      });

      const totalLen = (result.conversation_transcript?.length || 0) + (result.slides_section?.length || 0);
      setCompletedSteps(prev => ({ ...prev, aggregate: { aggregated: result } }));
      onComplete?.({ aggregated: result });
      toast.success(`Krok 6: Agregacja lokalna — ${(totalLen / 1000).toFixed(1)}k znaków`);
    } catch (err: any) {
      setError(err.message || "Nieznany błąd");
      toast.error("Błąd: " + (err.message || "nieznany"));
    } finally {
      setRunningStep("idle");
      setBatchProgress(null);
    }
  }

  function runStep(mode: string) {
    switch (mode) {
      case "crop-split": return runLocalDedup();
      case "ocr-captions": return runLocalOCR();
      case "describe-slides": return runLocalSlideOCR();
      case "aggregate": return runLocalAggregate();
    }
  }

  const isRunning = runningStep !== "idle";

  function getStepStatus(step: string): string | null {
    const data = completedSteps[step];
    if (!data) return null;
    if (step === "crop-split" && data.cropSplit) {
      return `${data.cropSplit.total_unique_slides} unikalnych z ${data.cropSplit.total_frames} klatek`;
    }
    if (step === "ocr-captions" && data.captions) {
      return `${data.captions.total_entries} wypowiedzi`;
    }
    if (step === "describe-slides" && data.slideDescriptions) {
      return `${data.slideDescriptions.slides?.length ?? 0} opisów`;
    }
    if (step === "aggregate" && data.aggregated) {
      const convLen = data.aggregated.conversation_transcript?.length || data.aggregated.integrated_transcript?.length || 0;
      const slidesLen = data.aggregated.slides_section?.length || 0;
      return `${((convLen + slidesLen) / 1000).toFixed(1)}k znaków`;
    }
    return "gotowe";
  }

  const allSteps: ("crop-split" | "ocr-captions" | "describe-slides" | "aggregate")[] = [
    "crop-split", "ocr-captions", "describe-slides", "aggregate",
  ];

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        Pipeline OCR (lokalne przetwarzanie)
      </p>

      {/* Steps 3-6: all local */}
      {allSteps.map((step) => {
        if (step === "describe-slides") {
          // Show PDF uploader before describe-slides
          return (
            <div key={step}>
              <PdfSlidesUploader
                meetingId={meetingId}
                recordingFilename={recordingFilename}
                onComplete={(result) => {
                  setCompletedSteps(prev => ({ ...prev, "describe-slides": result }));
                  onComplete?.(result);
                }}
              />
              {/* Step 5b: Describe slides locally */}
              {(() => {
                const config = stepConfig[step];
                const Icon = config.icon;
                const status = getStepStatus(step);
                const isThisRunning = runningStep === step;
                return (
                  <div className="space-y-0.5 mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runStep(step)}
                      disabled={isRunning}
                      className="w-full justify-start gap-2 text-xs h-8"
                    >
                      {isThisRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                      ) : status ? (
                        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span>
                        {config.stepNum}b. {isThisRunning ? "OCR slajdów…" : config.label}
                      </span>
                    </Button>
                    {isThisRunning && batchProgress && (
                      <p className="text-[9px] text-muted-foreground pl-6 animate-pulse">⏳ {batchProgress}</p>
                    )}
                    {status && (
                      <p className="text-[9px] text-muted-foreground pl-6">✓ {status}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        }

        const config = stepConfig[step];
        const Icon = config.icon;
        const status = getStepStatus(step);
        const isThisRunning = runningStep === step;
        const disabled = isRunning || (!hasFrames && step === "crop-split");

        return (
          <div key={step} className="space-y-0.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runStep(step)}
              disabled={disabled}
              className="w-full justify-start gap-2 text-xs h-8"
            >
              {isThisRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              ) : status ? (
                <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              ) : (
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span>
                {config.stepNum}. {isThisRunning ? `${config.label}…` : config.label}
              </span>
            </Button>
            {isThisRunning && batchProgress && (
              <p className="text-[9px] text-muted-foreground pl-6 animate-pulse">⏳ {batchProgress}</p>
            )}
            {status && (
              <p className="text-[9px] text-muted-foreground pl-6">✓ {status}</p>
            )}
          </div>
        );
      })}

      {!hasFrames && (
        <p className="text-[10px] text-muted-foreground text-center">
          Najpierw wygeneruj klatki (kroki 1-2)
        </p>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="text-[9px] text-muted-foreground/70 text-center leading-relaxed">
        <p>
          <strong>1-2)</strong> Klatki →{" "}
          <strong>3)</strong> Deduplikuj →{" "}
          <strong>4)</strong> OCR napisów →{" "}
          <strong>5)</strong> Wgraj PDF →{" "}
          <strong>5b)</strong> OCR slajdów →{" "}
          <strong>6)</strong> Agreguj
        </p>
        <p className="text-primary/60 mt-0.5">Wszystko lokalnie — 0 requestów AI</p>
      </div>
    </div>
  );
}
