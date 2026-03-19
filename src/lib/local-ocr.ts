import Tesseract from "tesseract.js";

// Crop region for Teams presentation area (matches SlideTranscriptionButton CROP_REGION)
const SLIDE_CROP = { xPct: 0.13, yPct: 0.12, wPct: 0.42, hPct: 0.60 };
// Caption bar: bottom ~18% of screen
const CAPTION_CROP = { xPct: 0.05, yPct: 0.82, wPct: 0.90, hPct: 0.16 };

let workerInstance: Tesseract.Worker | null = null;

export async function getOCRWorker(
  onProgress?: (msg: string) => void
): Promise<Tesseract.Worker> {
  if (workerInstance) return workerInstance;

  onProgress?.("Ładowanie modelu OCR (pol+eng)…");
  const worker = await Tesseract.createWorker("pol+eng", undefined, {
    logger: (m) => {
      if (m.status === "loading tesseract core" || m.status === "loading language traineddata") {
        onProgress?.(`OCR: ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
      }
    },
  });
  workerInstance = worker;
  return worker;
}

export async function terminateOCRWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}

function cropCanvas(
  img: HTMLImageElement,
  region: { xPct: number; yPct: number; wPct: number; hPct: number }
): HTMLCanvasElement {
  const sx = Math.round(img.width * region.xPct);
  const sy = Math.round(img.height * region.yPct);
  const sw = Math.round(img.width * region.wPct);
  const sh = Math.round(img.height * region.hPct);

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to decode image"));
    };
    img.src = URL.createObjectURL(blob);
  });
}

export interface CaptionOCRResult {
  text: string;
  confidence: number;
}

/**
 * OCR the caption bar at the bottom of a Teams screenshot.
 * Returns raw text from the caption area.
 */
export async function ocrCaptionBar(
  blob: Blob,
  worker: Tesseract.Worker
): Promise<CaptionOCRResult> {
  const img = await loadImage(blob);
  const canvas = cropCanvas(img, CAPTION_CROP);

  const {
    data: { text, confidence },
  } = await worker.recognize(canvas);

  return { text: text.trim(), confidence };
}

export interface SlideOCRResult {
  slide_title: string;
  content: string;
  key_info: string;
}

/**
 * OCR the presentation slide area from a Teams screenshot.
 * Extracts text content from the slide region.
 */
export async function ocrSlideContent(
  blob: Blob,
  worker: Tesseract.Worker
): Promise<SlideOCRResult> {
  const img = await loadImage(blob);
  const canvas = cropCanvas(img, SLIDE_CROP);

  const {
    data: { text },
  } = await worker.recognize(canvas);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const slideTitle = lines[0] || "Slajd bez tytułu";
  const content = lines.join("\n");

  // Extract key info: lines with numbers, percentages, dates
  const keyInfoLines = lines.filter((l) =>
    /\d+[%,.]|\d{4}[-/]|\b\d{1,3}[.,]\d/.test(l)
  );
  const keyInfo = keyInfoLines.join("; ") || "";

  return { slide_title: slideTitle, content, key_info: keyInfo };
}

/**
 * Parse Teams caption text into structured entries.
 * Teams captions typically show "Speaker Name: text" format.
 */
export function parseCaptionText(
  rawText: string,
  timestamp: string
): { timestamp: string; speaker: string; text: string }[] {
  if (!rawText.trim()) return [];

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const entries: { timestamp: string; speaker: string; text: string }[] = [];

  for (const line of lines) {
    // Try to match "Speaker: text" pattern
    const match = line.match(/^([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?: [A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)*)\s*[:：]\s*(.+)/i);
    if (match) {
      entries.push({
        timestamp,
        speaker: match[1].trim(),
        text: match[2].trim(),
      });
    } else if (line.length > 3) {
      // No speaker detected - use "Mówca"
      entries.push({
        timestamp,
        speaker: "Mówca",
        text: line,
      });
    }
  }

  return entries;
}
