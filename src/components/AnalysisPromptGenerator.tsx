import { useState, useEffect } from "react";
import { Copy, Check, ImageIcon, Loader2, FileText, Package, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { MeetingWithRelations } from "@/hooks/use-meetings";
import { toast } from "sonner";
import JSZip from "jszip";

interface Props {
  meeting: MeetingWithRelations;
  recordingUrl: string | null;
  framesVersion?: number;
}

interface FrameInfo {
  path: string;
  url: string;
  timestamp?: string;
}

export default function AnalysisPromptGenerator({ meeting, recordingUrl, framesVersion = 0 }: Props) {
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [audioTranscript, setAudioTranscript] = useState<string | null>(null);
  const [ocrCaptions, setOcrCaptions] = useState<string | null>(null);
  const [slideDescriptions, setSlideDescriptions] = useState<string | null>(null);
  const [uniqueFrames, setUniqueFrames] = useState<FrameInfo[]>([]);
  const [slideTimeline, setSlideTimeline] = useState<string | null>(null);
  const [slideSource, setSlideSource] = useState<"pdf" | "frames" | "none">("none");
  const [showAllFrames, setShowAllFrames] = useState(false);

  useEffect(() => {
    loadData();
  }, [meeting.id, framesVersion]);

  async function loadData() {
    setLoading(true);
    await Promise.all([loadAudioTranscript(), loadOcrCaptions(), loadSlideDescriptions(), loadUniqueFrames(), loadSlideTimeline()]);
    setLoading(false);
  }

  async function loadAudioTranscript() {
    try {
      const { data } = await supabase
        .from("transcript_lines")
        .select("timestamp, speaker, text, line_order")
        .eq("meeting_id", meeting.id)
        .order("line_order", { ascending: true });
      if (data && data.length > 0) {
        setAudioTranscript(data.map(l => `[${l.timestamp}] ${l.speaker}: ${l.text}`).join("\n"));
      }
    } catch {}
  }

  async function loadOcrCaptions() {
    try {
      const { data } = await supabase
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meeting.id)
        .eq("source", "captions-ocr")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.analysis_json) {
        const json = data.analysis_json as any;
        const entries = json.entries || json.captions || [];
        if (entries.length > 0) {
          setOcrCaptions(entries.map((e: any) => `[${e.timestamp}] ${e.speaker || "?"}: ${e.text}`).join("\n"));
        }
      }
    } catch {}
  }

  async function loadSlideDescriptions() {
    try {
      const { data } = await supabase
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meeting.id)
        .eq("source", "slide-descriptions")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.analysis_json) {
        const json = data.analysis_json as any;
        const slides = json.slides || json.descriptions || [];
        if (slides.length > 0) {
          setSlideDescriptions(slides.map((s: any) => `[${s.timestamp || "?"}] "${s.title || s.slide_title || "Slajd"}" -- ${s.description || s.content || ""}`).join("\n\n"));
        }
      }
    } catch {}
  }

  // Load slides: prefer pdf-slides, then crop-split, then unique-frames
  async function loadUniqueFrames() {
    try {
      // Try pdf-slides first
      for (const source of ["pdf-slides", "crop-split", "unique-frames"]) {
        const { data } = await supabase
          .from("meeting_analyses")
          .select("analysis_json")
          .eq("meeting_id", meeting.id)
          .eq("source", source)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!data?.analysis_json) continue;

        const json = data.analysis_json as any;
        const framePaths = json.unique_slides || json.frames;
        if (!framePaths?.length) continue;

        const loaded: FrameInfo[] = [];
        for (const f of framePaths) {
          const { data: urlData } = await supabase.storage
            .from("recordings")
            .createSignedUrl(f.path, 60 * 60);
          if (urlData?.signedUrl) {
            loaded.push({
              path: f.path,
              url: urlData.signedUrl,
              timestamp: f.ts_formatted || f.timestamp_formatted || `P${f.page || f.timestamp}`,
            });
          }
        }

        if (loaded.length > 0) {
          setUniqueFrames(loaded);
          setSlideSource(source === "pdf-slides" ? "pdf" : "frames");
          return;
        }
      }
      setUniqueFrames([]);
      setSlideSource("none");
    } catch {
      setUniqueFrames([]);
      setSlideSource("none");
    }
  }

  // Load timeline of slide changes from crop-split
  async function loadSlideTimeline() {
    try {
      const { data } = await supabase
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meeting.id)
        .eq("source", "crop-split")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data?.analysis_json) return;
      const json = data.analysis_json as any;
      const uniqueSlides = json.unique_slides as { ts_formatted: string; timestamp: number }[] | undefined;

      if (uniqueSlides?.length) {
        const timeline = uniqueSlides
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((s, i) => `${i + 1}. Zmiana slajdu @ ${s.ts_formatted}`)
          .join("\n");
        setSlideTimeline(timeline);
      }
    } catch {}
  }

  // --- PROMPT BUILDERS ---

  function getCommonDataSection(): string {
    const hasAudio = !!audioTranscript;
    const hasOcr = !!ocrCaptions;
    const hasSlideDesc = !!slideDescriptions;
    const hasSlides = uniqueFrames.length > 0;
    const hasTimeline = !!slideTimeline;

    const parts: string[] = [];

    parts.push(`## DANE WEJSCIOWE`);
    if (hasAudio) parts.push(`- Transkrypt AUDIO — pelna rozmowa z timestampami`);
    if (hasOcr) parts.push(`- Dialogi OCR — odczytane z paska live captions (z IMIONAMI mowcow)`);
    if (hasSlideDesc) parts.push(`- Opisy slajdow prezentacji z timestampami`);
    if (hasSlides) parts.push(`- ${uniqueFrames.length} obrazow slajdow prezentacji (${slideSource === "pdf" ? "z PDF" : "screeny ze spotkania"})`);
    if (hasTimeline) parts.push(`- Timeline zmian slajdow (momenty gdy slajd sie zmienil na ekranie)`);

    return parts.join("\n");
  }

  function getSlideMapping(): string {
    if (uniqueFrames.length === 0) return "";

    const isPdf = slideSource === "pdf";
    const hasTimeline = !!slideTimeline;

    if (isPdf && hasTimeline) {
      return `
## MAPOWANIE SLAJDOW DO CZASU
W folderze slajdy/ znajdziesz ${uniqueFrames.length} stron prezentacji (z PDF — czyste, oryginalne slajdy).
W pliku timeline_zmian_slajdow.txt znajdziesz momenty gdy slajd sie zmienil na ekranie podczas spotkania.

TWOJE ZADANIE:
1. Dopasuj kazda strone PDF do odpowiedniego zakresu czasowego na podstawie timeline
2. Pokaz kazdy slajd z zakresem: "Slajd X (05:30 – 12:15): tresc..."
3. NIE powtarzaj tego samego slajdu — jesli ten sam slajd pojawia sie wielokrotnie, zgrupuj pod jednym wpisem
4. Slajd obowiazuje od momentu pojawienia sie do momentu nastepnej zmiany`;
    }

    if (isPdf) {
      return `
## SLAJDY PREZENTACJI
W folderze slajdy/ znajdziesz ${uniqueFrames.length} stron prezentacji (z PDF).
Odczytaj z nich WSZYSTKIE dane: tytuly, bullet pointy, wykresy, tabele, liczby.
Kazdy slajd pokaz z numerem strony i pelna trescia.`;
    }

    return `
## SLAJDY PREZENTACJI
W archiwum ZIP znajduje sie ${uniqueFrames.length} unikalnych obrazow slajdow.
Odczytaj z nich WSZYSTKIE dane: tytuly, bullet pointy, wykresy, tabele, liczby.`;
  }

  function getJsonFormat(): string {
    return `## FORMAT WYNIKU
Zwroc DOKLADNIE taki JSON (bez komentarzy, bez markdown):
{
  "summary": "Kompletne podsumowanie 3-6 zdan po polsku.",
  "conversation_transcript": "PELNA transkrypcja rozmowy z poprawionymi mowcami. [MM:SS] Imie: tekst...",
  "slides_section": "Slajd 1 (MM:SS – MM:SS): tytul — opis i podsumowanie kazdego slajdu",
  "sentiment": "pozytywny | neutralny | negatywny | mieszany",
  "participants": ["Imie Nazwisko"],
  "tags": ["temat1", "temat2"],
  "key_quotes": ["Najwazniejszy cytat"],
  "action_items": [{ "task": "Zadanie", "owner": "Osoba", "deadline": "YYYY-MM-DD lub null" }],
  "decisions": [{ "decision": "Decyzja", "rationale": "Uzasadnienie", "timestamp": "MM:SS" }],
  "slide_insights": [{
    "slide_timestamp": "MM:SS",
    "slide_title": "Tytul slajdu",
    "slide_content": "Pelna tresc ze slajdu",
    "discussion_context": "Co mowili uczestnicy",
    "extra_context": "Info z dialogu niewidoczne na slajdzie",
    "discrepancies": "Rozbieznosci"
  }],
  "speakers": ["Imie Nazwisko"],
  "slide_markers": [{ "timestamp": "MM:SS", "slide_title": "Tytul", "slide_summary": "Podsumowanie" }]
}`;
  }

  function getRules(): string {
    return `## ZASADY
1. conversation_transcript = PELNA rozmowa, KAZDA linia z audio z poprawionym mowca
2. slides_section = osobna sekcja ze WSZYSTKIMI slajdami i ich podsumowaniami, kazdy slajd z zakresem czasowym
3. NIE powtarzaj tego samego slajdu — grupuj pod jednym wpisem jesli sie powtarza
4. Action items = konkretne zadania z wlascicielem
5. Decisions = wyraznie podjete decyzje
6. Summary = zwiezle, z danymi liczbowymi, po polsku
7. Tags = glowne tematy (max 7)
8. Slide insights = SZCZEGOLOWA analiza KAZDEGO slajdu z korelacja do dialogu`;
  }

  function buildGeminiPrompt(): string {
    const hasAudio = !!audioTranscript;
    const hasOcr = !!ocrCaptions;
    const hasSlideDesc = !!slideDescriptions;

    return `Jestes ekspertem AI do analizy spotkan biznesowych w systemie Cerebro.
Wykonaj kompleksowa analize tego spotkania.

${getCommonDataSection()}
${getSlideMapping()}

## GLOWNE ZADANIE: AGREGACJA TRANSKRYPCJI + ANALIZA

### ZADANIE 1: ZAGREGOWANA TRANSKRYPCJA ROZMOWY (conversation_transcript)
Idz chronologicznie przez CALY transkrypt audio — KAZDA linia musi trafic do wyniku.
Dla kazdej linii:
1. **Identyfikuj mowce** — znajdz odpowiednik w OCR (±30s tolerancji) i uzyj IMIENIA mowcy zamiast "Mowca"/"unknown"/"Speaker"
2. **Popraw bledy** — jesli OCR ma lepsza wersje slowa, uzyj jej
3. **Zachowaj PELNA dlugosc** — NIE skracaj, NIE pomijaj, NIE streszczaj
4. **NIE generuj nowych wypowiedzi** — tylko koryguj istniejace

Format linii: [MM:SS] Imie: wypowiedz

### ZADANIE 2: SLAJDY I ICH PODSUMOWANIA (slides_section)
Dla kazdego slajdu podaj:
- Zakres czasowy (od pojawienia sie do nastepnego slajdu)
- Tytul slajdu odczytany z obrazu
- Pelny opis tresci (bullet pointy, dane, wykresy, tabele)
- Krotkie podsumowanie merytoryczne

WAZNE: Odczytaj WSZYSTKIE dane z zalaczonych OBRAZOW slajdow — tytuly, bullet pointy, wykresy, tabele, liczby.
${hasSlideDesc ? "Porownaj z opisami OCR i uzupelnij brakujace informacje." : ""}

${hasAudio ? `## ZRODLO 1: TRANSKRYPT AUDIO
---
${audioTranscript}
---` : ""}

${hasOcr ? `## ZRODLO 2: DIALOGI OCR (z live captions)
---
${ocrCaptions}
---` : ""}

${hasSlideDesc ? `## ZRODLO 3: OPISY SLAJDOW (OCR)
---
${slideDescriptions}
---` : ""}

${getJsonFormat()}

${getRules()}`;
  }

  function buildClaudePrompt(): string {
    const hasAudio = !!audioTranscript;
    const hasOcr = !!ocrCaptions;
    const hasSlideDesc = !!slideDescriptions;

    return `<task>
Jestes ekspertem AI do analizy spotkan biznesowych w systemie Cerebro.
Wykonaj kompleksowa analize tego spotkania.
</task>

${getCommonDataSection()}
${getSlideMapping()}

<instructions>
## AGREGACJA TRANSKRYPCJI

Idz chronologicznie przez CALY transkrypt audio — KAZDA linia musi trafic do wyniku.
Dla kazdej linii:
1. Identyfikuj mowce — znajdz odpowiednik w OCR (±30s tolerancji) i uzyj IMIENIA
2. Popraw bledy — jesli OCR ma lepsza wersje slowa, uzyj jej
3. Zachowaj PELNA dlugosc — NIE skracaj, NIE pomijaj
4. NIE generuj nowych wypowiedzi — tylko koryguj istniejace

Format linii: [MM:SS] Imie: wypowiedz

## ANALIZA SLAJDOW

Dla kazdego slajdu podaj:
- Zakres czasowy (od pojawienia sie do nastepnego slajdu)
- Tytul slajdu
- Pelny opis tresci (bullet pointy, dane, wykresy, tabele)
- Podsumowanie merytoryczne
- Korelacja z dialogiem — co mowili uczestnicy o tym slajdzie

NIE powtarzaj tego samego slajdu — grupuj pod jednym wpisem.
</instructions>

${hasAudio ? `<audio_transcript>
${audioTranscript}
</audio_transcript>` : ""}

${hasOcr ? `<ocr_captions>
${ocrCaptions}
</ocr_captions>` : ""}

${hasSlideDesc ? `<slide_descriptions>
${slideDescriptions}
</slide_descriptions>` : ""}

<output_format>
${getJsonFormat()}
</output_format>

${getRules()}`;
  }

  function buildChatGPTPrompt(): string {
    const hasAudio = !!audioTranscript;
    const hasOcr = !!ocrCaptions;
    const hasSlideDesc = !!slideDescriptions;

    return `Jestes ekspertem AI do analizy spotkan biznesowych w systemie Cerebro.

${getCommonDataSection()}
${getSlideMapping()}

## GLOWNE ZADANIE: AGREGACJA TRANSKRYPCJI + ANALIZA

### ZADANIE 1: ZAGREGOWANA TRANSKRYPCJA ROZMOWY (conversation_transcript)
Idz chronologicznie przez CALY transkrypt audio — KAZDA linia musi trafic do wyniku.
Dla kazdej linii:
1. **Identyfikuj mowce** — znajdz odpowiednik w OCR (±30s tolerancji) i uzyj IMIENIA mowcy zamiast "Mowca"/"unknown"/"Speaker"
2. **Popraw bledy** — jesli OCR ma lepsza/poprawniejsza wersje slowa lub frazy, uzyj jej
3. **Zachowaj PELNA dlugosc** — NIE skracaj, NIE pomijaj, NIE streszczaj. Cala rozmowa musi byc w wyniku
4. **NIE generuj nowych wypowiedzi** — tylko koryguj istniejace
5. **NIE wstawiaj slajdow** w tej sekcji — slajdy ida w sekcji 2

Format linii: [MM:SS] Imie: wypowiedz

### ZADANIE 2: SLAJDY I ICH PODSUMOWANIA (slides_section)
Pod transkrypcja, umiesc sekcje ze WSZYSTKIMI slajdami.
Dla kazdego slajdu podaj:
- Zakres czasowy (od pojawienia sie do nastepnego slajdu)
- Tytul slajdu
- Pelny opis tresci (bullet pointy, dane, wykresy)
- Krotkie podsumowanie merytoryczne
${uniqueFrames.length > 0 ? "- Odczytaj dodatkowe dane z zalaczonych OBRAZOW slajdow" : ""}

NIE powtarzaj tego samego slajdu — grupuj pod jednym wpisem.

${hasAudio ? `## ZRODLO 1: TRANSKRYPT AUDIO
---
${audioTranscript}
---` : ""}

${hasOcr ? `## ZRODLO 2: DIALOGI OCR (z live captions)
---
${ocrCaptions}
---` : ""}

${hasSlideDesc ? `## ZRODLO 3: OPISY SLAJDOW
---
${slideDescriptions}
---` : ""}

${getJsonFormat()}

${getRules()}`;
  }

  function buildInstrukcja(): string {
    const hasSlides = uniqueFrames.length > 0;
    const isPdf = slideSource === "pdf";

    return `=== INSTRUKCJA ANALIZY SPOTKANIA ===
Spotkanie: ${meeting.title}
Data: ${meeting.meeting_date || "nieznana"}

--- ZAWARTOSC PACZKI ---
${[
  "prompt_gemini.txt — prompt dla Gemini (REKOMENDOWANY)",
  "prompt_claude.txt — prompt dla Claude",
  "prompt_chatgpt.txt — prompt dla ChatGPT",
  audioTranscript ? "transkrypcja_audio.txt — surowy transkrypt z audio" : null,
  ocrCaptions ? "dialogi_ocr.txt — dialogi z live captions (z imionami)" : null,
  slideDescriptions ? "opisy_slajdow.txt — opisy tresci slajdow (OCR)" : null,
  slideTimeline ? "timeline_zmian_slajdow.txt — momenty zmian slajdow na ekranie" : null,
  hasSlides ? `slajdy/ — ${uniqueFrames.length} ${isPdf ? "stron prezentacji (PDF)" : "screenow ze spotkania"}` : null,
].filter(Boolean).map(s => `  - ${s}`).join("\n")}

--- REKOMENDACJA #1: GEMINI 2.5 PRO ---
Najlepszy do multimodalnej analizy (slajdy + tekst).
1. Otworz ai.google.dev lub aistudio.google.com
2. Wybierz model: Gemini 2.5 Pro
3. Wgraj prompt_gemini.txt jako pierwszy plik
4. Wgraj transkrypcja_audio.txt i dialogi_ocr.txt
${hasSlides ? `5. Wgraj WSZYSTKIE obrazy z folderu slajdy/` : ""}
${slideTimeline ? `6. Wgraj timeline_zmian_slajdow.txt` : ""}
7. Wyslij — Gemini odczyta slajdy z obrazow i zagreguje transkrypcje
8. Skopiuj wynik JSON i wklej w Cerebro w sekcji "Importuj wynik analizy"

--- REKOMENDACJA #2: CLAUDE OPUS / SONNET ---
Najlepszy reasoning + dlugi kontekst (200k tokenow).
1. Otworz claude.ai
2. Wybierz model: Claude Opus 4.6 lub Sonnet
3. Wgraj prompt_claude.txt jako pierwszy plik
4. Wgraj transkrypcja_audio.txt i dialogi_ocr.txt
${hasSlides ? `5. Wgraj obrazy z folderu slajdy/ (Claude rozpozna tresc)` : ""}
${slideTimeline ? `6. Wgraj timeline_zmian_slajdow.txt` : ""}
7. Wyslij i skopiuj wynik JSON do Cerebro

--- ALTERNATYWA: CHATGPT GPT-4o ---
1. Otworz chat.openai.com
2. Wybierz model: GPT-4o
3. Wgraj WSZYSTKIE pliki z paczki (prompt_chatgpt.txt + dane + slajdy)
4. ChatGPT zagreguje transkrypcje i opisze slajdy
5. Skopiuj wynik JSON do Cerebro

--- IMPORT WYNIKU ---
W Cerebro na stronie spotkania znajdz sekcje "Importuj wynik analizy".
Wklej caly JSON i kliknij "Importuj".
`;
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildGeminiPrompt());
    setCopied(true);
    toast.success("Prompt Gemini skopiowany do schowka");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadZip() {
    setDownloading(true);
    try {
      const zip = new JSZip();
      const safeTitle = meeting.title.replace(/[^a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, "_").slice(0, 50);

      toast.info("Pakuje prompty...");

      // Prompts for each AI
      zip.file("prompt_gemini.txt", buildGeminiPrompt());
      zip.file("prompt_claude.txt", buildClaudePrompt());
      zip.file("prompt_chatgpt.txt", buildChatGPTPrompt());
      zip.file("INSTRUKCJA.txt", buildInstrukcja());

      // Data files
      if (audioTranscript) {
        zip.file("transkrypcja_audio.txt", audioTranscript);
      }
      if (ocrCaptions) {
        zip.file("dialogi_ocr.txt", ocrCaptions);
      }
      if (slideDescriptions) {
        zip.file("opisy_slajdow.txt", slideDescriptions);
      }
      if (slideTimeline) {
        zip.file("timeline_zmian_slajdow.txt", slideTimeline);
      }

      // Slide images
      if (uniqueFrames.length > 0) {
        toast.info(`Pakuje ${uniqueFrames.length} slajdow...`);
        const slidesFolder = zip.folder("slajdy");
        for (let i = 0; i < uniqueFrames.length; i++) {
          const frame = uniqueFrames[i];
          try {
            const resp = await fetch(frame.url);
            const blob = await resp.blob();
            const ext = blob.type.includes("png") ? "png" : "jpg";
            const name = `slajd_${String(i + 1).padStart(2, "0")}_${frame.timestamp?.replace(/[:/]/g, "m") || i}.${ext}`;
            slidesFolder!.file(name, blob);
          } catch (err) {
            console.warn(`Failed to fetch frame ${i}:`, err);
          }
        }
      }

      toast.info("Generuje archiwum ZIP...");
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = `${safeTitle}_paczka_AI.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);

      const sizeMB = (zipBlob.size / (1024 * 1024)).toFixed(1);
      toast.success(`Paczka ZIP pobrana (${sizeMB} MB). Uzyj Gemini, Claude lub ChatGPT.`);
    } catch (err: any) {
      console.error("ZIP error:", err);
      toast.error("Blad tworzenia ZIP: " + (err.message || "nieznany"));
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Sprawdzam dane spotkania...
      </div>
    );
  }

  const hasData = !!audioTranscript || !!ocrCaptions || uniqueFrames.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] uppercase text-muted-foreground font-mono-data tracking-wider">
          Paczka danych AI
        </h2>
      </div>

      <button
        onClick={handleDownloadZip}
        disabled={downloading}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 press-effect"
      >
        {downloading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Pakuje ZIP...
          </>
        ) : (
          <>
            <Archive className="w-4 h-4" />
            Pobierz ZIP ({[
              "3 prompty",
              audioTranscript ? "audio" : null,
              ocrCaptions ? "OCR" : null,
              slideDescriptions ? "opisy" : null,
              slideTimeline ? "timeline" : null,
              uniqueFrames.length > 0 ? `${uniqueFrames.length} slajdow` : null,
            ].filter(Boolean).join(" + ")})
          </>
        )}
      </button>

      {!hasData && (
        <p className="text-[10px] text-muted-foreground/60 text-center">
          Najpierw uruchom transkrypcje audio i/lub OCR aby przygotowac dane
        </p>
      )}

      {/* Recommendations */}
      <div className="space-y-2">
        <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
          <p className="text-xs font-medium text-primary mb-1">Rekomendacja #1: Gemini 2.5 Pro</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Najlepszy do multimodalnej analizy slajdow + tekstu. Wgraj <strong>prompt_gemini.txt</strong> + dane + slajdy do <strong>aistudio.google.com</strong>.
          </p>
        </div>
        <div className="bg-muted/30 border border-border rounded-md p-3">
          <p className="text-xs font-medium text-foreground mb-1">Rekomendacja #2: Claude Opus</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Najlepszy reasoning + dlugi kontekst (200k). Wgraj <strong>prompt_claude.txt</strong> + dane do <strong>claude.ai</strong>.
          </p>
        </div>
        <div className="bg-muted/30 border border-border rounded-md p-3">
          <p className="text-xs font-medium text-foreground mb-1">Alternatywa: ChatGPT GPT-4o</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Wgraj <strong>prompt_chatgpt.txt</strong> + wszystkie pliki do <strong>chat.openai.com</strong>.
          </p>
        </div>
      </div>

      {/* Package contents */}
      <div className="bg-muted/30 border border-border rounded-md p-3 space-y-1">
        <p className="text-[11px] font-medium text-foreground">Zawartosc paczki:</p>
        <ul className="text-[10px] text-muted-foreground space-y-0.5">
          <li className="flex items-center gap-1">
            <Check className="w-3 h-3 text-primary" />
            INSTRUKCJA.txt + 3 prompty (Gemini, Claude, ChatGPT)
          </li>
          {audioTranscript ? (
            <li className="flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              transkrypcja_audio.txt — surowy transkrypt z audio
            </li>
          ) : (
            <li className="text-muted-foreground/60">Brak transkryptu audio</li>
          )}
          {ocrCaptions ? (
            <li className="flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              dialogi_ocr.txt — dialogi z live captions (z imionami)
            </li>
          ) : (
            <li className="text-muted-foreground/60">Brak dialogow OCR</li>
          )}
          {slideDescriptions ? (
            <li className="flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              opisy_slajdow.txt — opisy tresci slajdow
            </li>
          ) : (
            <li className="text-muted-foreground/60">Brak opisow slajdow</li>
          )}
          {slideTimeline ? (
            <li className="flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              timeline_zmian_slajdow.txt — momenty zmian slajdow
            </li>
          ) : (
            <li className="text-muted-foreground/60">Brak timeline (uruchom deduplikacje klatek)</li>
          )}
          {uniqueFrames.length > 0 ? (
            <li className="flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              {uniqueFrames.length} {slideSource === "pdf" ? "stron z PDF" : "screenow"} w folderze slajdy/
            </li>
          ) : (
            <li className="text-muted-foreground/60">Brak slajdow</li>
          )}
        </ul>
      </div>

      {/* Frame thumbnails */}
      {uniqueFrames.length > 0 && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              {slideSource === "pdf" ? "Slajdy z PDF" : "Screeny"} w paczce
            </span>
            <span className="text-[10px] font-mono-data text-muted-foreground">
              {uniqueFrames.length} {slideSource === "pdf" ? "stron" : "unikalnych"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(showAllFrames ? uniqueFrames : uniqueFrames.slice(0, 8)).map((frame, i) => (
              <div key={i} className="relative group">
                <img
                  src={frame.url}
                  alt={`Slajd @ ${frame.timestamp}`}
                  className="w-full aspect-video object-cover rounded border border-border"
                  loading="lazy"
                />
                <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono-data bg-background/80 px-0.5 rounded">
                  {frame.timestamp}
                </span>
              </div>
            ))}
          </div>
          {uniqueFrames.length > 8 && (
            <button
              onClick={() => setShowAllFrames(!showAllFrames)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllFrames ? "Pokaz mniej" : `Pokaz wszystkie (${uniqueFrames.length})`}
            </button>
          )}
        </div>
      )}

      {/* Prompt preview */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Prompt Gemini (w ZIP)
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Skopiowano!" : "Kopiuj"}
          </button>
        </div>
        <pre className="p-3 text-[10px] leading-relaxed text-muted-foreground max-h-36 overflow-auto whitespace-pre-wrap font-mono-data">
          {buildGeminiPrompt().slice(0, 800)}...
        </pre>
      </div>

      <div className="bg-muted/30 border border-border rounded-md p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5" />
          Jak uzyc:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-[11px]">
          <li>Kliknij <strong>Pobierz ZIP</strong> powyzej</li>
          <li>Rozpakuj archiwum</li>
          <li>Otworz <strong>INSTRUKCJA.txt</strong> — wybierz AI (Gemini / Claude / ChatGPT)</li>
          <li>Wgraj odpowiedni <strong>prompt + pliki danych + slajdy</strong></li>
          <li>AI zagreguje transkrypcje, dopasuje slajdy do czasu i przeanalizuje spotkanie</li>
          <li>Wklej wynik JSON w sekcji <strong>"Importuj wynik analizy"</strong> ponizej</li>
        </ol>
      </div>
    </div>
  );
}
