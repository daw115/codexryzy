import { useState, useRef } from "react";
import { Upload, ClipboardPaste, Loader2, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AnalysisRecord {
  source: string;
  analysis_json: any;
}

interface Props {
  meetingId: string;
  analyses?: AnalysisRecord[];
  onSuccess?: (analysis: any) => void;
}

type AiSource = "gemini" | "claude" | "chatgpt";

const AI_SOURCES: { key: AiSource; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: "gemini", label: "Gemini", color: "text-blue-500", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20" },
  { key: "claude", label: "Claude", color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20" },
  { key: "chatgpt", label: "ChatGPT", color: "text-green-500", bgColor: "bg-green-500/10", borderColor: "border-green-500/20" },
];

export default function AnalysisJsonImporter({ meetingId, analyses = [], onSuccess }: Props) {
  const [importing, setImporting] = useState<AiSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<AiSource>>(new Set());
  const [showPaste, setShowPaste] = useState(false);
  const [pasteJson, setPasteJson] = useState("");
  const [pasteSource, setPasteSource] = useState<AiSource>("gemini");
  const qc = useQueryClient();

  const fileRefs = useRef<Record<AiSource, HTMLInputElement | null>>({
    gemini: null,
    claude: null,
    chatgpt: null,
  });

  // Check which sources already have analyses
  const existingSources = new Set(
    analyses
      .filter(a => ["gemini", "claude", "chatgpt"].includes(a.source))
      .map(a => a.source as AiSource)
  );

  function extractJsonFromText(text: string): any {
    const trimmed = text.trim();

    // Try direct parse first
    try {
      return JSON.parse(trimmed);
    } catch {}

    // Try to extract JSON from markdown code block
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }

    // Try to find JSON object in text (first { to last })
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {}
    }

    throw new Error("Nie znaleziono prawidlowego JSON w pliku");
  }

  async function importAnalysis(jsonData: any, source: AiSource) {
    if (typeof jsonData !== "object" || jsonData === null || Array.isArray(jsonData)) {
      throw new Error("JSON musi byc obiektem {}");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nie zalogowano");

    // Delete previous analysis of same source
    await (supabase as any).from("meeting_analyses").delete()
      .eq("meeting_id", meetingId)
      .eq("source", source);

    // Save analysis
    const { error: saveErr } = await (supabase as any).from("meeting_analyses").insert({
      meeting_id: meetingId,
      source,
      analysis_json: jsonData,
    });
    if (saveErr) throw new Error("Blad zapisu: " + saveErr.message);

    // Update meeting summary + tags if present
    const updatePayload: any = {};
    if (jsonData.summary) updatePayload.summary = jsonData.summary;
    if (jsonData.tags?.length) updatePayload.tags = jsonData.tags;
    if (Object.keys(updatePayload).length > 0) {
      await supabase.from("meetings").update(updatePayload).eq("id", meetingId);
    }

    // Save action items
    if (jsonData.action_items?.length > 0) {
      const items = jsonData.action_items.map((ai: any) => ({
        meeting_id: meetingId,
        user_id: user.id,
        task: ai.task,
        owner: ai.owner || "Nieprzypisane",
        deadline: ai.deadline || null,
      }));
      await supabase.from("action_items").insert(items);
    }

    // Save decisions
    if (jsonData.decisions?.length > 0) {
      const decisionRows = jsonData.decisions.map((d: any) => ({
        meeting_id: meetingId,
        decision: d.decision,
        rationale: d.rationale || null,
        timestamp: d.timestamp || null,
      }));
      await supabase.from("decisions").insert(decisionRows);
    }

    // Save participants
    if (jsonData.participants?.length > 0) {
      const { data: existing } = await supabase
        .from("meeting_participants")
        .select("name")
        .eq("meeting_id", meetingId);
      const existingNames = new Set((existing || []).map((p: any) => p.name?.toLowerCase()));
      const newParticipants = jsonData.participants
        .filter((name: string) => !existingNames.has(name.toLowerCase()))
        .map((name: string) => ({ meeting_id: meetingId, name }));
      if (newParticipants.length > 0) {
        await supabase.from("meeting_participants").insert(newParticipants);
      }
    }

    // Invalidate caches
    qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
    qc.invalidateQueries({ queryKey: ["meetings"] });
    qc.invalidateQueries({ queryKey: ["meeting-analyses", meetingId] });
    qc.invalidateQueries({ queryKey: ["all-action-items"] });
  }

  async function handleFileUpload(source: AiSource, file: File) {
    setImporting(source);
    setError(null);

    try {
      const text = await file.text();
      const parsed = extractJsonFromText(text);
      await importAnalysis(parsed, source);

      setImported(prev => new Set(prev).add(source));
      const label = AI_SOURCES.find(s => s.key === source)!.label;
      toast.success(`Analiza ${label} zaimportowana`);
      onSuccess?.(parsed);
    } catch (err: any) {
      setError(err.message || "Blad importu");
      toast.error("Blad: " + (err.message || "nieznany"));
    } finally {
      setImporting(null);
      // Reset file input
      const ref = fileRefs.current[source];
      if (ref) ref.value = "";
    }
  }

  async function handlePasteImport() {
    if (!pasteJson.trim()) return;
    setImporting(pasteSource);
    setError(null);

    try {
      const parsed = extractJsonFromText(pasteJson);
      await importAnalysis(parsed, pasteSource);

      setImported(prev => new Set(prev).add(pasteSource));
      setPasteJson("");
      const label = AI_SOURCES.find(s => s.key === pasteSource)!.label;
      toast.success(`Analiza ${label} zaimportowana`);
      onSuccess?.(parsed);
    } catch (err: any) {
      setError(err.message || "Blad importu");
      toast.error("Blad: " + (err.message || "nieznany"));
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-[11px] uppercase text-muted-foreground font-mono-data tracking-wider">
        Importuj wynik analizy
      </h2>

      {/* Status badges */}
      {(existingSources.size > 0 || imported.size > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {AI_SOURCES.map(({ key, label, color, bgColor, borderColor }) => {
            const exists = existingSources.has(key) || imported.has(key);
            if (!exists) return null;
            return (
              <span
                key={key}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${bgColor} ${color} border ${borderColor}`}
              >
                {label} ✓
              </span>
            );
          })}
        </div>
      )}

      {/* File upload buttons */}
      <div className="space-y-1.5">
        {AI_SOURCES.map(({ key, label, color }) => {
          const isImporting = importing === key;
          const alreadyImported = existingSources.has(key) || imported.has(key);

          return (
            <div key={key}>
              <input
                ref={el => { fileRefs.current[key] = el; }}
                type="file"
                accept=".json,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(key, file);
                }}
              />
              <button
                onClick={() => fileRefs.current[key]?.click()}
                disabled={importing !== null}
                className={`flex items-center gap-2 w-full text-xs font-medium px-3 py-2 rounded-md border transition-colors disabled:opacity-50 press-effect ${
                  alreadyImported
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                {isImporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                ) : alreadyImported ? (
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <Upload className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span>
                  {isImporting
                    ? `Importuje ${label}...`
                    : alreadyImported
                      ? `${label} — zaimportowany (kliknij aby nadpisac)`
                      : `Wgraj JSON z ${label}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Paste fallback */}
      <button
        onClick={() => setShowPaste(!showPaste)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
      >
        <ClipboardPaste className="w-3 h-3" />
        {showPaste ? "Ukryj wklejanie" : "lub wklej JSON recznie"}
        {showPaste ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {showPaste && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {AI_SOURCES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPasteSource(key)}
                className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                  pasteSource === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            value={pasteJson}
            onChange={(e) => { setPasteJson(e.target.value); setError(null); }}
            placeholder='Wklej JSON tutaj...\n{\n  "summary": "...",\n  "action_items": [...]\n}'
            className="w-full h-28 bg-muted/30 border border-border rounded-md p-3 text-[10px] font-mono-data text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handlePasteImport}
            disabled={importing !== null || !pasteJson.trim()}
            className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 press-effect"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ClipboardPaste className="w-3.5 h-3.5" />
            )}
            Zapisz jako {AI_SOURCES.find(s => s.key === pasteSource)!.label}
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
