import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Claude API helpers ---
function toClaudeContent(parts: any[]): any[] {
  return parts.map((p) => {
    if (p.type === "text") return p;
    if (p.type === "image_url") {
      const m = p.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (m) return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
    }
    return p;
  });
}

async function callClaude(apiKey: string, contentParts: any[], tools: any[], toolName: string) {
  const claudeTools = tools.map((t: any) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16384,
      messages: [{ role: "user", content: toClaudeContent(contentParts) }],
      tools: claudeTools,
      tool_choice: { type: "tool", name: toolName },
    }),
  });

  return res;
}

function extractToolInput(aiResult: any): any {
  const toolUse = aiResult.content?.find((b: any) => b.type === "tool_use");
  return toolUse?.input ?? null;
}
// --- End helpers ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meetingId } = await req.json();
    if (!meetingId) throw new Error("meetingId is required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch meeting + transcript
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .select("*, transcript_lines(*)")
      .eq("id", meetingId)
      .single();

    if (meetErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Meeting: ${meeting.title}, recording: ${meeting.recording_filename}, user: ${meeting.user_id}`);

    // 2. Load unique slides from meeting_analyses
    const frames: { base64: string; timestamp: string; mimeType: string }[] = [];

    const { data: uniqueFramesAnalysis } = await supabase
      .from("meeting_analyses")
      .select("analysis_json")
      .eq("meeting_id", meetingId)
      .eq("source", "unique-frames")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const uniqueFramePaths = (uniqueFramesAnalysis?.analysis_json as any)?.frames as
      { path: string; timestamp: number; timestamp_formatted: string }[] | undefined;

    if (uniqueFramePaths && uniqueFramePaths.length > 0) {
      console.log(`Loading ${uniqueFramePaths.length} unique slides from analysis`);
      for (const ff of uniqueFramePaths.slice(0, 25)) {
        const { data } = await supabaseAdmin.storage.from("recordings").download(ff.path);
        if (!data) continue;
        const bytes = new Uint8Array(await data.arrayBuffer());
        const base64 = btoa(bytes.reduce((s, b) => s + String.fromCharCode(b), ""));
        const isJpeg = ff.path.match(/\.jpe?g$/i);
        const mimeType = isJpeg ? "image/jpeg" : "image/png";
        frames.push({ base64, mimeType, timestamp: ff.timestamp_formatted });
      }
      console.log(`Loaded ${frames.length} unique slides for Claude`);
    } else if (meeting.recording_filename) {
      console.log("No unique-frames analysis found — scanning storage directly");
      const stem = meeting.recording_filename.replace(/\.[^.]+$/, "");
      const dirPrefixes = [`${meeting.user_id}/frames/${stem}`];

      const { data: allDirs } = await supabaseAdmin.storage
        .from("recordings").list(`${meeting.user_id}/frames`);

      if (allDirs) {
        for (const d of allDirs) {
          if (d.name.startsWith(stem + "_part")) {
            dirPrefixes.push(`${meeting.user_id}/frames/${d.name}`);
          }
        }
      }

      const allFrameFiles: { path: string; timestamp: number }[] = [];
      for (const prefix of dirPrefixes) {
        const { data: files } = await supabaseAdmin.storage
          .from("recordings")
          .list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } });
        if (files) {
          for (const file of files) {
            if (!file.name.match(/\.(jpg|jpeg|png)$/i)) continue;
            const match = file.name.match(/frame_(\d+)/);
            allFrameFiles.push({ path: `${prefix}/${file.name}`, timestamp: match ? parseInt(match[1]) : 0 });
          }
        }
      }
      allFrameFiles.sort((a, b) => a.timestamp - b.timestamp);

      const seenHashes = new Set<string>();
      for (const ff of allFrameFiles.slice(0, 30)) {
        const { data } = await supabaseAdmin.storage.from("recordings").download(ff.path);
        if (!data) continue;
        const bytes = new Uint8Array(await data.arrayBuffer());
        let hash = 0;
        const slice = bytes.slice(0, 2048);
        for (let j = 0; j < slice.length; j += 4) { hash = ((hash << 5) - hash + slice[j]) | 0; }
        if (seenHashes.has(hash.toString(36))) continue;
        seenHashes.add(hash.toString(36));
        const base64 = btoa(bytes.reduce((s, b) => s + String.fromCharCode(b), ""));
        const isJpeg = ff.path.match(/\.jpe?g$/i);
        frames.push({ base64, mimeType: isJpeg ? "image/jpeg" : "image/png", timestamp: `${Math.floor(ff.timestamp / 60)}:${String(ff.timestamp % 60).padStart(2, "0")}` });
        if (frames.length >= 20) break;
      }
      console.log(`Fallback: loaded ${frames.length} frames`);
    } else {
      console.log("No recording — skipping frame loading");
    }

    // 3. Build transcript
    const transcriptLines = meeting.transcript_lines || [];
    const sorted = [...transcriptLines].sort((a: any, b: any) => a.line_order - b.line_order);
    const transcriptText = sorted.length > 0
      ? sorted.map((l: any) => `[${l.timestamp}] ${l.speaker}: ${l.text}`).join("\n")
      : "";

    const hasTranscript = transcriptText.length > 0;
    const hasSlides = frames.length > 0;

    // 3b. Load captions-ocr and merged transcript if available
    let slideTranscriptText = "";
    for (const src of ["merged", "captions-ocr"]) {
      const { data: ocrAnalysis } = await supabase
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", src)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ocrAnalysis?.analysis_json) {
        const json = ocrAnalysis.analysis_json as any;
        if (json.integrated_transcript) { slideTranscriptText = json.integrated_transcript; break; }
        if (json.transcript) { slideTranscriptText = json.transcript; break; }
      }
    }
    const hasSlideTranscript = slideTranscriptText.length > 0;

    console.log(`Analysis input: audio_transcript=${hasTranscript} (${sorted.length} lines), slide_transcript=${hasSlideTranscript} (${slideTranscriptText.length} chars), slides=${hasSlides} (${frames.length})`);

    // 4. Build multimodal content
    const contentParts: any[] = [];

    const dataSources = [];
    if (hasTranscript) dataSources.push(`Transkrypt audio: ${sorted.length} linii z timestampami`);
    if (hasSlideTranscript) dataSources.push(`Transkrypcja wizualna slajdów (OCR): ${slideTranscriptText.length} znaków`);
    if (hasSlides) dataSources.push(`${frames.length} obrazów slajdów prezentacji z timestampami`);

    contentParts.push({
      type: "text",
      text: `Jesteś ekspertem AI do analizy spotkań biznesowych w systemie Cerebro.

## DANE WEJŚCIOWE
${dataSources.map(s => `- ${s}`).join("\n")}

## KLUCZOWE ZADANIE: AGREGACJA DWÓCH TRANSKRYPCJI

${hasTranscript && hasSlideTranscript ? `Masz DWA źródła transkrypcji:
1. **Transkrypt AUDIO** — co mówili uczestnicy
2. **Transkrypt WIZUALNY** — treść odczytana z slajdów (OCR)

POŁĄCZ oba źródła w jedną, zintegrowaną transkrypcję.
Wstaw slajdy (📊 SLAJD:) w chronologicznie właściwe miejsca dialogu.` : hasTranscript ? `Masz transkrypt audio. Połącz go ze slajdami wizualnymi.` : hasSlideTranscript ? `Masz transkrypcję wizualną slajdów.` : `Przeanalizuj dostępne slajdy.`}

${hasTranscript ? `## TRANSKRYPT AUDIO:
---
${transcriptText.slice(0, 15000)}
---` : "## (Brak transkryptu audio)"}

${hasSlideTranscript ? `## TRANSKRYPT WIZUALNY SLAJDÓW (OCR):
---
${slideTranscriptText.slice(0, 10000)}
---` : ""}

${hasSlides ? `\nPoniżej ${frames.length} slajdów prezentacji w kolejności chronologicznej:` : ""}`,
    });

    for (const frame of frames) {
      contentParts.push({ type: "text", text: `\n--- Slajd @ ${frame.timestamp} ---` });
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${frame.mimeType};base64,${frame.base64}` },
      });
    }

    if (!hasTranscript && !hasSlides && !hasSlideTranscript) {
      return new Response(JSON.stringify({ error: "Brak danych do analizy — dodaj transkrypt lub wygeneruj klatki" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Call Claude
    const tools = [{
      type: "function",
      function: {
        name: "save_meeting_analysis",
        description: "Save integrated meeting analysis with chronological slide-dialogue aggregation",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Kompletne podsumowanie 3-6 zdań po polsku." },
            integrated_transcript: { type: "string", description: "ZINTEGROWANY chronologiczny zapis spotkania." },
            sentiment: { type: "string", enum: ["pozytywny", "neutralny", "negatywny", "mieszany"] },
            participants: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" }, description: "3-7 tagów tematycznych" },
            key_quotes: { type: "array", items: { type: "string" } },
            action_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  task: { type: "string" },
                  owner: { type: "string" },
                  deadline: { type: "string" },
                },
                required: ["task", "owner"],
              },
            },
            decisions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  decision: { type: "string" },
                  rationale: { type: "string" },
                  timestamp: { type: "string" },
                },
                required: ["decision"],
              },
            },
            slide_insights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slide_timestamp: { type: "string" },
                  slide_title: { type: "string" },
                  slide_content: { type: "string" },
                  discussion_context: { type: "string" },
                  extra_context: { type: "string" },
                  discrepancies: { type: "string" },
                },
                required: ["slide_content", "discussion_context"],
              },
            },
          },
          required: ["summary", "integrated_transcript", "sentiment", "tags", "action_items", "decisions", "slide_insights"],
        },
      },
    }];

    const response = await callClaude(ANTHROPIC_API_KEY, contentParts, tools, "save_meeting_analysis");

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — spróbuj za chwilę." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Claude API error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const analysis = extractToolInput(aiResult);

    if (!analysis) {
      console.error("Claude response without tool call:", JSON.stringify(aiResult).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return structured analysis" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analysis result: summary=${analysis.summary?.length ?? 0} chars, actions=${analysis.action_items?.length ?? 0}, decisions=${analysis.decisions?.length ?? 0}`);

    // Retry helper
    async function dbRetry<T>(fn: () => Promise<{ error: any; data?: T }>, label: string) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const { error } = await fn();
        if (!error) return;
        console.error(`${label} failed (attempt ${attempt}/${maxRetries}):`, error);
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * attempt));
        else console.error(`${label} failed after ${maxRetries} attempts, continuing...`);
      }
    }

    // 6. Save to meeting_analyses table
    await dbRetry(() => supabase.from("meeting_analyses").insert({
      meeting_id: meetingId,
      source: "gemini",
      analysis_json: analysis,
    }), "save analysis");

    // 7. Update meeting summary + tags
    const updatePayload: any = {};
    if (analysis.summary) updatePayload.summary = analysis.summary;
    if (analysis.tags?.length) updatePayload.tags = analysis.tags;
    if (Object.keys(updatePayload).length > 0) {
      await dbRetry(() => supabase.from("meetings").update(updatePayload).eq("id", meetingId), "update meeting");
    }

    // 8. Save action items
    if (analysis.action_items?.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const items = analysis.action_items.map((ai: any) => ({
          meeting_id: meetingId,
          user_id: user.id,
          task: ai.task,
          owner: ai.owner || "Nieprzypisane",
          deadline: ai.deadline || null,
        }));
        await dbRetry(() => supabase.from("action_items").insert(items), "save action_items");
      }
    }

    // 9. Save decisions
    if (analysis.decisions?.length > 0) {
      const decisionRows = analysis.decisions.map((d: any) => ({
        meeting_id: meetingId,
        decision: d.decision,
        rationale: d.rationale || null,
        timestamp: d.timestamp || null,
      }));
      await dbRetry(() => supabase.from("decisions").insert(decisionRows), "save decisions");
    }

    // 10. Save participants
    if (analysis.participants?.length > 0) {
      const existingParticipants = meeting.meeting_participants || [];
      const existingNames = new Set((existingParticipants as any[]).map((p: any) => p.name?.toLowerCase()));
      const newParticipants = analysis.participants
        .filter((name: string) => !existingNames.has(name.toLowerCase()))
        .map((name: string) => ({ meeting_id: meetingId, name }));
      if (newParticipants.length > 0) {
        await dbRetry(() => supabase.from("meeting_participants").insert(newParticipants), "save participants");
      }
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-meeting error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
