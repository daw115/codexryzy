import { useState } from "react";
import { GitCompare, Loader2, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AnalysisData {
  source: string;
  analysis_json: any;
}

interface Props {
  meetingId: string;
  analyses: AnalysisData[];
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  gemini: { label: "Gemini", color: "text-blue-600", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20" },
  claude: { label: "Claude", color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20" },
  chatgpt: { label: "ChatGPT", color: "text-green-600", bgColor: "bg-green-500/10", borderColor: "border-green-500/20" },
};

export default function AnalysisComparison({ meetingId, analyses }: Props) {
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const qc = useQueryClient();

  const gemini = analyses.find((a) => a.source === "gemini");
  const claude = analyses.find((a) => a.source === "claude");
  const chatgpt = analyses.find((a) => a.source === "chatgpt");
  const merged = analyses.find((a) => a.source === "merged");

  const aiAnalyses = [gemini, claude, chatgpt].filter(Boolean) as AnalysisData[];
  const canMerge = aiAnalyses.length >= 2 && !merged;

  function toggle(section: string) {
    setExpandedSection(expandedSection === section ? null : section);
  }

  // Local merge — pick best values from all available analyses
  function mergeAnalyses(sources: AnalysisData[]): any {
    const result: any = {};

    // Summary — pick longest
    const summaries = sources.map(s => s.analysis_json?.summary).filter(Boolean);
    result.summary = summaries.sort((a, b) => b.length - a.length)[0] || "";

    // Transcript — pick longest
    const transcripts = sources.map(s =>
      s.analysis_json?.conversation_transcript || s.analysis_json?.integrated_transcript
    ).filter(Boolean);
    result.conversation_transcript = transcripts.sort((a, b) => b.length - a.length)[0] || "";

    // Slides section — pick longest
    const slidesSections = sources.map(s => s.analysis_json?.slides_section).filter(Boolean);
    result.slides_section = slidesSections.sort((a, b) => b.length - a.length)[0] || "";

    // Sentiment — majority vote
    const sentiments = sources.map(s => s.analysis_json?.sentiment).filter(Boolean);
    result.sentiment = sentiments[0] || "neutralny";

    // Participants — union
    const allParticipants = new Set<string>();
    for (const s of sources) {
      for (const p of s.analysis_json?.participants || []) {
        allParticipants.add(p);
      }
    }
    result.participants = Array.from(allParticipants);

    // Tags — union, deduplicated
    const allTags = new Set<string>();
    for (const s of sources) {
      for (const t of s.analysis_json?.tags || []) {
        allTags.add(t.toLowerCase());
      }
    }
    result.tags = Array.from(allTags);

    // Key quotes — union
    const allQuotes = new Set<string>();
    for (const s of sources) {
      for (const q of s.analysis_json?.key_quotes || []) {
        allQuotes.add(q);
      }
    }
    result.key_quotes = Array.from(allQuotes);

    // Action items — union by task text (deduplicated)
    const seenTasks = new Set<string>();
    result.action_items = [];
    for (const s of sources) {
      for (const ai of s.analysis_json?.action_items || []) {
        const key = ai.task?.toLowerCase().trim();
        if (key && !seenTasks.has(key)) {
          seenTasks.add(key);
          result.action_items.push(ai);
        }
      }
    }

    // Decisions — union by decision text
    const seenDecisions = new Set<string>();
    result.decisions = [];
    for (const s of sources) {
      for (const d of s.analysis_json?.decisions || []) {
        const key = d.decision?.toLowerCase().trim();
        if (key && !seenDecisions.has(key)) {
          seenDecisions.add(key);
          result.decisions.push(d);
        }
      }
    }

    // Slide insights — union
    const seenSlides = new Set<string>();
    result.slide_insights = [];
    for (const s of sources) {
      for (const si of s.analysis_json?.slide_insights || []) {
        const key = (si.slide_title || si.slide_content || "").toLowerCase().trim().slice(0, 50);
        if (key && !seenSlides.has(key)) {
          seenSlides.add(key);
          result.slide_insights.push(si);
        }
      }
    }

    // Speakers — union
    const allSpeakers = new Set<string>();
    for (const s of sources) {
      for (const sp of s.analysis_json?.speakers || []) {
        allSpeakers.add(sp);
      }
    }
    result.speakers = Array.from(allSpeakers);

    // Slide markers — from source with most
    const markerSources = sources.map(s => s.analysis_json?.slide_markers || []);
    result.slide_markers = markerSources.sort((a, b) => b.length - a.length)[0] || [];

    // Meta — which sources were merged
    result.merged_from = sources.map(s => s.source);

    return result;
  }

  async function handleMerge() {
    setMerging(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie zalogowano");

      const mergedAnalysis = mergeAnalyses(aiAnalyses);

      // Delete previous merged
      await (supabase as any).from("meeting_analyses").delete()
        .eq("meeting_id", meetingId).eq("source", "merged");

      // Save merged
      const { error: saveErr } = await (supabase as any).from("meeting_analyses").insert({
        meeting_id: meetingId,
        source: "merged",
        analysis_json: mergedAnalysis,
      });
      if (saveErr) throw new Error("Blad zapisu: " + saveErr.message);

      // Update meeting
      const updatePayload: any = {};
      if (mergedAnalysis.summary) updatePayload.summary = mergedAnalysis.summary;
      if (mergedAnalysis.tags?.length) updatePayload.tags = mergedAnalysis.tags;
      if (Object.keys(updatePayload).length > 0) {
        await supabase.from("meetings").update(updatePayload).eq("id", meetingId);
      }

      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["meeting-analyses", meetingId] });
      toast.success(`Zagregowano ${aiAnalyses.length} analiz`);
    } catch (err: any) {
      setError(err.message || "Nieznany blad");
      toast.error("Blad: " + (err.message || ""));
    } finally {
      setMerging(false);
    }
  }

  const showAnalyses = analyses.filter(a => ["gemini", "claude", "chatgpt", "merged"].includes(a.source)).length > 0;
  if (!showAnalyses) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-[11px] uppercase text-muted-foreground font-mono-data tracking-wider">
        Analizy spotkania
      </h2>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
          const exists = analyses.find(a => a.source === key);
          if (!exists) return null;
          return (
            <span
              key={key}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bgColor} ${cfg.color} border ${cfg.borderColor}`}
            >
              {cfg.label} ✓
            </span>
          );
        })}
        {merged && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            Zagregowana ✓
          </span>
        )}
      </div>

      {/* Merge button */}
      {canMerge && (
        <button
          onClick={handleMerge}
          disabled={merging}
          className="flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 press-effect w-full justify-center"
        >
          {merging ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Agreguje analizy...
            </>
          ) : (
            <>
              <GitCompare className="w-4 h-4" />
              Zagreguj {aiAnalyses.length} analizy
            </>
          )}
        </button>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}

      {/* Individual analyses */}
      {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
        const analysis = analyses.find(a => a.source === key);
        if (!analysis) return null;
        return (
          <CollapsibleSection
            key={key}
            title={`Analiza ${cfg.label}`}
            isOpen={expandedSection === key}
            onToggle={() => toggle(key)}
          >
            <AnalysisView data={analysis.analysis_json} />
          </CollapsibleSection>
        );
      })}

      {/* Merged analysis */}
      {merged && (
        <CollapsibleSection
          title="Zagregowana analiza"
          isOpen={expandedSection === "merged"}
          onToggle={() => toggle("merged")}
        >
          <AnalysisView data={merged.analysis_json} />
        </CollapsibleSection>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <span className="text-[11px] font-medium text-foreground">{title}</span>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {isOpen && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

function AnalysisView({ data }: { data: any }) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  if (!data) return <p className="text-[10px] text-muted-foreground italic">Brak danych</p>;

  const transcript = data.conversation_transcript || data.integrated_transcript || "";
  const TRANSCRIPT_LIMIT = 2000;
  const isLong = transcript.length > TRANSCRIPT_LIMIT;

  return (
    <div className="space-y-3 text-[10px]">
      {data.summary && (
        <div>
          <span className="font-medium text-foreground">Podsumowanie:</span>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">{data.summary}</p>
        </div>
      )}
      {data.sentiment && (
        <p><span className="font-medium text-foreground">Sentyment:</span> <span className="text-muted-foreground">{data.sentiment}</span></p>
      )}
      {data.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.tags.map((t: string, i: number) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px]">{t}</span>
          ))}
        </div>
      )}

      {/* Transcript — limited to prevent browser freeze */}
      {transcript && (
        <div>
          <span className="font-medium text-foreground">Transkrypcja rozmowy:</span>
          <div className="mt-1 bg-muted/30 border border-border rounded-md p-2 max-h-64 overflow-y-auto">
            <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono-data">
              {showFullTranscript ? transcript : transcript.slice(0, TRANSCRIPT_LIMIT)}
              {isLong && !showFullTranscript && "..."}
            </pre>
          </div>
          {isLong && (
            <button
              onClick={() => setShowFullTranscript(!showFullTranscript)}
              className="text-[9px] text-primary hover:text-primary/80 mt-1"
            >
              {showFullTranscript ? "Ukryj" : `Pokaz calosc (${(transcript.length / 1000).toFixed(0)}k znakow)`}
            </button>
          )}
        </div>
      )}

      {data.key_quotes?.length > 0 && (
        <div>
          <span className="font-medium text-foreground">Kluczowe cytaty:</span>
          <ul className="mt-0.5 space-y-0.5">
            {data.key_quotes.map((q: string, i: number) => (
              <li key={i} className="text-muted-foreground italic">"{q}"</li>
            ))}
          </ul>
        </div>
      )}

      {data.action_items?.length > 0 && (
        <div>
          <span className="font-medium text-foreground">Zadania ({data.action_items.length}):</span>
          <ul className="mt-0.5 space-y-0.5">
            {data.action_items.map((ai: any, i: number) => (
              <li key={i} className="text-muted-foreground">
                <strong>{ai.owner}</strong>: {ai.task}{ai.deadline ? ` (do ${ai.deadline})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.decisions?.length > 0 && (
        <div>
          <span className="font-medium text-foreground">Decyzje ({data.decisions.length}):</span>
          <ul className="mt-0.5 space-y-1">
            {data.decisions.map((d: any, i: number) => (
              <li key={i} className="text-muted-foreground">
                {d.decision}
                {d.rationale && <span className="block ml-3 text-muted-foreground/70 italic">{d.rationale}</span>}
                {d.timestamp && <span className="text-[9px] text-muted-foreground/50 ml-1">@ {d.timestamp}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.slide_insights?.length > 0 && (
        <div>
          <span className="font-medium text-foreground">Analiza slajdow ({data.slide_insights.length}):</span>
          <div className="mt-1 space-y-2">
            {data.slide_insights.map((s: any, i: number) => (
              <div key={i} className="border border-border rounded-md p-2 space-y-1 bg-muted/10">
                <div className="flex items-center gap-1.5">
                  {s.slide_timestamp && (
                    <span className="text-[9px] font-mono-data text-primary bg-primary/10 px-1 py-0.5 rounded">@ {s.slide_timestamp}</span>
                  )}
                  {s.slide_title && <span className="font-medium text-foreground">{s.slide_title}</span>}
                </div>
                <p className="text-muted-foreground">{s.slide_content || s.slide_description}</p>
                {s.discussion_context && (
                  <p className="text-muted-foreground/80 italic border-l-2 border-primary/30 pl-2">
                    {s.discussion_context}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
