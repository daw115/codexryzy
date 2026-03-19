export interface TranscriptLine {
  timestamp: string;
  speaker: string;
  text: string;
}

export interface SlideDescription {
  timestamp: string;
  slide_title: string;
  content: string;
  key_info?: string;
}

export interface AggregationResult {
  conversation_transcript: string;
  slides_section: string;
  summary: string;
  speakers: string[];
  slide_markers: { timestamp: string; slide_title: string; slide_summary: string }[];
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Deduplicate caption entries - remove consecutive duplicates with same speaker+text.
 * Ported from transcribe-slides/index.ts dedupeCaptionEntries.
 */
export function dedupeCaptionEntries(
  entries: TranscriptLine[]
): TranscriptLine[] {
  const deduped: TranscriptLine[] = [];
  for (const entry of entries) {
    const normalized: TranscriptLine = {
      timestamp: String(entry.timestamp || "").trim(),
      speaker: String(entry.speaker || "Mówca").trim(),
      text: String(entry.text || "").trim(),
    };
    if (!normalized.text) continue;

    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.speaker === normalized.speaker &&
      previous.text === normalized.text
    ) {
      continue;
    }

    deduped.push(normalized);
  }
  return deduped;
}

/**
 * Merge audio transcript lines with OCR caption entries by timestamp.
 * Use OCR speaker names to enrich audio lines (which may have generic "Mówca" speakers).
 */
function mergeTranscripts(
  audioLines: TranscriptLine[],
  ocrEntries: TranscriptLine[]
): TranscriptLine[] {
  if (audioLines.length === 0) return ocrEntries;
  if (ocrEntries.length === 0) return audioLines;

  // Build a map of OCR entries by timestamp (±30s tolerance)
  const ocrByTime = ocrEntries.map((e) => ({
    ...e,
    seconds: parseTimestamp(e.timestamp),
  }));

  const merged: TranscriptLine[] = [];
  const usedOcrIndices = new Set<number>();

  for (const audioLine of audioLines) {
    const audioSec = parseTimestamp(audioLine.timestamp);
    let enrichedSpeaker = audioLine.speaker;

    // Find closest OCR entry within ±30s to get speaker name
    if (
      enrichedSpeaker === "Mówca" ||
      enrichedSpeaker === "unknown" ||
      enrichedSpeaker === "Speaker"
    ) {
      let closestIdx = -1;
      let closestDist = 31;
      for (let i = 0; i < ocrByTime.length; i++) {
        const dist = Math.abs(ocrByTime[i].seconds - audioSec);
        if (dist < closestDist && !usedOcrIndices.has(i)) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      if (closestIdx >= 0 && ocrByTime[closestIdx].speaker !== "Mówca") {
        enrichedSpeaker = ocrByTime[closestIdx].speaker;
        usedOcrIndices.add(closestIdx);
      }
    }

    merged.push({
      timestamp: audioLine.timestamp,
      speaker: enrichedSpeaker,
      text: audioLine.text,
    });
  }

  // Add OCR entries that weren't matched (unique OCR content)
  for (let i = 0; i < ocrByTime.length; i++) {
    if (usedOcrIndices.has(i)) continue;

    const ocrLine = ocrByTime[i];
    // Check if there's already a similar audio line within ±30s
    const audioSecs = audioLines.map((l) => parseTimestamp(l.timestamp));
    const hasNearby = audioSecs.some(
      (s) => Math.abs(s - ocrLine.seconds) < 30
    );
    if (!hasNearby) {
      merged.push({
        timestamp: ocrLine.timestamp,
        speaker: ocrLine.speaker,
        text: ocrLine.text,
      });
    }
  }

  // Sort by timestamp
  merged.sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp));

  return merged;
}

/**
 * Aggregate audio transcript, OCR captions, and slide descriptions
 * into a unified output. Replaces the AI-powered aggregate step.
 */
export function aggregateTranscripts(params: {
  audioLines: TranscriptLine[];
  ocrCaptionEntries: TranscriptLine[];
  slideDescriptions: SlideDescription[];
}): AggregationResult {
  const { audioLines, ocrCaptionEntries, slideDescriptions } = params;

  // 1. Merge audio + OCR transcripts
  const mergedLines = mergeTranscripts(audioLines, ocrCaptionEntries);

  // 2. Build conversation transcript with slide markers inserted
  const slidesByTime = [...slideDescriptions]
    .map((s) => ({ ...s, seconds: parseTimestamp(s.timestamp) }))
    .sort((a, b) => a.seconds - b.seconds);

  const conversationParts: string[] = [];
  let slideIdx = 0;

  for (const line of mergedLines) {
    const lineSec = parseTimestamp(line.timestamp);

    // Insert slide markers that appear before this line
    while (slideIdx < slidesByTime.length && slidesByTime[slideIdx].seconds <= lineSec) {
      const slide = slidesByTime[slideIdx];
      conversationParts.push(
        `[${slide.timestamp}] 📊 SLAJD: "${slide.slide_title}" — ${slide.content.slice(0, 200)}`
      );
      slideIdx++;
    }

    conversationParts.push(`[${line.timestamp}] ${line.speaker}: ${line.text}`);
  }

  // Add remaining slides
  while (slideIdx < slidesByTime.length) {
    const slide = slidesByTime[slideIdx];
    conversationParts.push(
      `[${slide.timestamp}] 📊 SLAJD: "${slide.slide_title}" — ${slide.content.slice(0, 200)}`
    );
    slideIdx++;
  }

  const conversationTranscript = conversationParts.join("\n");

  // 3. Build slides section
  const slidesSection = slideDescriptions
    .sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp))
    .map(
      (s) =>
        `📊 [${s.timestamp}] "${s.slide_title}"\n${s.content}${s.key_info ? `\nKluczowe: ${s.key_info}` : ""}`
    )
    .join("\n\n");

  // 4. Collect unique speakers
  const speakerSet = new Set<string>();
  for (const line of mergedLines) {
    if (line.speaker && line.speaker !== "Mówca" && line.speaker !== "unknown") {
      speakerSet.add(line.speaker);
    }
  }
  const speakers = Array.from(speakerSet);

  // 5. Build slide markers
  const slideMarkers = slideDescriptions
    .sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp))
    .map((s) => ({
      timestamp: s.timestamp,
      slide_title: s.slide_title,
      slide_summary: s.content.slice(0, 150),
    }));

  return {
    conversation_transcript: conversationTranscript,
    slides_section: slidesSection,
    summary: "", // Will be filled by the consolidated AI analysis
    speakers,
    slide_markers: slideMarkers,
  };
}
