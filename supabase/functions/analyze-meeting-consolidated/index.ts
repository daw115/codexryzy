import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meetingId } = await req.json();
    if (!meetingId) throw new Error("meetingId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch meeting + transcript
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .select("*, transcript_lines(*), meeting_participants(*)")
      .eq("id", meetingId)
      .single();

    if (meetErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Consolidated analysis: ${meeting.title}, user: ${meeting.user_id}`);

    // 2. Load unique slides from meeting_analyses
    const frames: { base64: string; timestamp: string; mimeType: string }[] = [];

    // Try unique-frames first, then crop-split
    for (const source of ["unique-frames", "crop-split"]) {
      if (frames.length > 0) break;
      const { data: analysis } = await supabase
        .from("meeting_analyses")
        .select("analysis_json")
        .eq("meeting_id", meetingId)
        .eq("source", source)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const slidePaths = (analysis?.analysis_json as any)?.unique_slides as
        { path: string; timestamp: number; ts_formatted: string }[] | undefined;

      if (slidePaths && slidePaths.length > 0) {
        console.log(`Loading ${slidePaths.length} slides from ${source}`);
        for (const ff of slidePaths.slice(0, 25)) {
          const { data } = await supabaseAdmin.storage.from("recordings").download(ff.path);
          if (!data) continue;
          const bytes = new Uint8Array(await data.arrayBuffer());
          const base64 = btoa(bytes.reduce((s, b) => s + String.fromCharCode(b), ""));
          const isJpeg = ff.path.match(/\.jpe?g$/i);
          frames.push({ base64, mimeType: isJpeg ? "image/jpeg" : "image/png", timestamp: ff.ts_formatted });
          if (frames.length >= 20) break;
        }
      }
    }

    // 3. Build transcript
    const transcriptLines = meeting.transcript_lines || [];
    const sorted = [...transcriptLines].sort((a: any, b: any) => a.line_order - b.line_order);
    const transcriptText = sorted.length > 0
      ? sorted.map((l: any) => `[${l.timestamp}] ${l.speaker}: ${l.text}`).join("\n")
      : "";

    // 4. Load slide transcript (merged or captions-ocr)
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
        if (json.conversation_transcript) { slideTranscriptText = json.conversation_transcript; break; }
        if (json.integrated_transcript) { slideTranscriptText = json.integrated_transcript; break; }
        if (json.transcript) { slideTranscriptText = json.transcript; break; }
      }
    }

    // 5. Load existing knowledge patterns/contexts for matching
    const { data: existingPatterns } = await supabase
      .from("task_patterns")
      .select("*")
      .order("frequency", { ascending: false })
      .limit(30);

    const { data: existingContexts } = await supabase
      .from("project_contexts")
      .select("*")
      .order("last_activity", { ascending: false })
      .limit(20);

    const patternsCtx = (existingPatterns || []).map((p: any) =>
      `- "${p.pattern_name}" (freq: ${p.frequency}, keywords: ${(p.keywords || []).join(", ")})`
    ).join("\n");

    const projectsCtx = (existingContexts || []).map((c: any) =>
      `- "${c.name}" (meetings: ${c.meeting_count}, keywords: ${(c.keywords || []).join(", ")})`
    ).join("\n");

    const hasTranscript = transcriptText.length > 0;
    const hasSlides = frames.length > 0;
    const hasSlideTranscript = slideTranscriptText.length > 0;

    console.log(`Input: audio=${hasTranscript} (${sorted.length} lines), slides=${hasSlides} (${frames.length}), slideTranscript=${hasSlideTranscript} (${slideTranscriptText.length} chars)`);

    if (!hasTranscript && !hasSlides && !hasSlideTranscript) {
      return new Response(JSON.stringify({ error: "Brak danych do analizy — dodaj transkrypt lub wygeneruj klatki" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Build multimodal content
    const contentParts: any[] = [];

    const dataSources = [];
    if (hasTranscript) dataSources.push(`Transkrypt audio: ${sorted.length} linii`);
    if (hasSlideTranscript) dataSources.push(`Transkrypcja wizualna (OCR): ${slideTranscriptText.length} znaków`);
    if (hasSlides) dataSources.push(`${frames.length} obrazów slajdów`);

    contentParts.push({
      type: "text",
      text: `Jesteś ekspertem AI do analizy spotkań biznesowych w systemie Cerebro.
Wykonaj JEDNĄ kompleksową analizę tego spotkania, obejmującą zarówno analizę treści jak i ekstrakcję wiedzy.

## DANE WEJŚCIOWE
${dataSources.map(s => `- ${s}`).join("\n")}

${hasTranscript && hasSlideTranscript ? `## ZADANIE AGREGACJI
Masz DWA źródła transkrypcji:
1. **Transkrypt AUDIO** — co mówili uczestnicy
2. **Transkrypt WIZUALNY** — treść slajdów (OCR)

POŁĄCZ oba źródła w zintegrowaną transkrypcję. Wstaw slajdy (📊 SLAJD:) w chronologicznie właściwe miejsca dialogu.
Format: [MM:SS] Mówca: tekst... oraz 📊 SLAJD: treść` : ""}

${hasTranscript ? `## TRANSKRYPT AUDIO:
---
${transcriptText.slice(0, 15000)}
---` : ""}

${hasSlideTranscript ? `## TRANSKRYPT WIZUALNY (OCR):
---
${slideTranscriptText.slice(0, 10000)}
---` : ""}

## KONTEKST BAZY WIEDZY
Istniejące wzorce zadań:
${patternsCtx || "brak"}

Istniejące konteksty projektowe:
${projectsCtx || "brak"}

${hasSlides ? `\nPoniżej ${frames.length} slajdów prezentacji:` : ""}`,
    });

    for (const frame of frames) {
      contentParts.push({ type: "text", text: `\n--- Slajd @ ${frame.timestamp} ---` });
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${frame.mimeType};base64,${frame.base64}` },
      });
    }

    // 7. Single Gemini 2.5-pro call with combined tool schema
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: contentParts }],
        tools: [{
          type: "function",
          function: {
            name: "save_consolidated_analysis",
            description: "Save consolidated meeting analysis + knowledge extraction in one call",
            parameters: {
              type: "object",
              properties: {
                // --- Meeting Analysis ---
                summary: {
                  type: "string",
                  description: "Kompletne podsumowanie 3-6 zdań po polsku. Główny temat, kluczowe ustalenia, dane liczbowe, wnioski i następne kroki.",
                },
                integrated_transcript: {
                  type: "string",
                  description: "ZINTEGROWANY chronologiczny zapis spotkania łączący dialog audio z treścią slajdów. Format: [MM:SS] Mówca: tekst... oraz 📊 SLAJD: treść slajdu.",
                },
                sentiment: {
                  type: "string",
                  enum: ["pozytywny", "neutralny", "negatywny", "mieszany"],
                },
                participants: {
                  type: "array",
                  items: { type: "string" },
                  description: "Lista uczestników",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-7 tagów tematycznych",
                },
                key_quotes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Najważniejsze cytaty",
                },
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
                    additionalProperties: false,
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
                    additionalProperties: false,
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
                    additionalProperties: false,
                  },
                },
                // --- Knowledge Extraction ---
                knowledge_summary: {
                  type: "string",
                  description: "Zwięzłe podsumowanie 2-4 zdań do bazy wiedzy",
                },
                key_topics: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-8 kluczowych tematów",
                },
                project_context: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    is_new: { type: "boolean" },
                    description: { type: "string" },
                    keywords: { type: "array", items: { type: "string" } },
                  },
                  required: ["name", "is_new"],
                },
                task_patterns: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      pattern_name: { type: "string" },
                      is_existing: { type: "boolean" },
                      keywords: { type: "array", items: { type: "string" } },
                      suggested_category: { type: "string" },
                    },
                    required: ["pattern_name", "is_existing", "keywords"],
                  },
                },
              },
              required: ["summary", "integrated_transcript", "sentiment", "tags", "action_items", "decisions", "slide_insights", "knowledge_summary", "key_topics", "project_context", "task_patterns"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_consolidated_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — spróbuj za chwilę." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Brak kredytów AI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("AI response without tool call:", JSON.stringify(aiResult).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return structured analysis" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log(`Result: summary=${analysis.summary?.length ?? 0}, actions=${analysis.action_items?.length ?? 0}, decisions=${analysis.decisions?.length ?? 0}, topics=${analysis.key_topics?.length ?? 0}`);

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

    // 8. Save meeting analysis
    await dbRetry(() => supabase.from("meeting_analyses").insert({
      meeting_id: meetingId,
      source: "gemini",
      analysis_json: analysis,
    }), "save analysis");

    // 9. Update meeting summary + tags
    const updatePayload: any = {};
    if (analysis.summary) updatePayload.summary = analysis.summary;
    if (analysis.tags?.length) updatePayload.tags = analysis.tags;
    if (Object.keys(updatePayload).length > 0) {
      await dbRetry(() => supabase.from("meetings").update(updatePayload).eq("id", meetingId), "update meeting");
    }

    // 10. Save action items
    if (analysis.action_items?.length > 0) {
      const items = analysis.action_items.map((ai: any) => ({
        meeting_id: meetingId,
        user_id: user.id,
        task: ai.task,
        owner: ai.owner || "Nieprzypisane",
        deadline: ai.deadline || null,
      }));
      await dbRetry(() => supabase.from("action_items").insert(items), "save action_items");
    }

    // 11. Save decisions
    if (analysis.decisions?.length > 0) {
      const decisionRows = analysis.decisions.map((d: any) => ({
        meeting_id: meetingId,
        decision: d.decision,
        rationale: d.rationale || null,
        timestamp: d.timestamp || null,
      }));
      await dbRetry(() => supabase.from("decisions").insert(decisionRows), "save decisions");
    }

    // 12. Save participants
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

    // 13. Save knowledge summary
    if (analysis.knowledge_summary) {
      await dbRetry(() => supabaseAdmin.from("knowledge_summaries").insert({
        meeting_id: meetingId,
        user_id: user.id,
        summary_text: analysis.knowledge_summary,
        key_topics: analysis.key_topics || [],
        project_context: analysis.project_context?.name || null,
        sentiment: analysis.sentiment === "pozytywny" ? "positive" :
                   analysis.sentiment === "negatywny" ? "negative" :
                   analysis.sentiment === "mieszany" ? "mixed" : "neutral",
      }), "save knowledge");
    }

    // 14. Upsert project context
    if (analysis.project_context?.name) {
      const pcName = analysis.project_context.name;
      if (analysis.project_context.is_new) {
        await supabaseAdmin.from("project_contexts").insert({
          user_id: user.id,
          name: pcName,
          description: analysis.project_context.description || "",
          keywords: analysis.project_context.keywords || [],
          meeting_count: 1,
          last_activity: new Date().toISOString(),
        });
      } else {
        const { data: existing } = await supabase
          .from("project_contexts")
          .select("id, meeting_count")
          .eq("name", pcName)
          .limit(1);
        if (existing?.length) {
          await supabaseAdmin.from("project_contexts")
            .update({
              meeting_count: (existing[0].meeting_count || 0) + 1,
              last_activity: new Date().toISOString(),
            })
            .eq("id", existing[0].id);
        } else {
          await supabaseAdmin.from("project_contexts").insert({
            user_id: user.id,
            name: pcName,
            description: analysis.project_context.description || "",
            keywords: analysis.project_context.keywords || [],
            meeting_count: 1,
            last_activity: new Date().toISOString(),
          });
        }
      }
    }

    // 15. Upsert task patterns
    for (const pattern of analysis.task_patterns || []) {
      if (pattern.is_existing) {
        const { data: ep } = await supabase
          .from("task_patterns")
          .select("id, frequency, keywords")
          .eq("pattern_name", pattern.pattern_name)
          .limit(1);
        if (ep?.length) {
          const mergedKw = [...new Set([...(ep[0].keywords || []), ...(pattern.keywords || [])])];
          await supabaseAdmin.from("task_patterns")
            .update({
              frequency: (ep[0].frequency || 0) + 1,
              keywords: mergedKw,
              last_seen: new Date().toISOString(),
              suggested_category: pattern.suggested_category || null,
            })
            .eq("id", ep[0].id);
        } else {
          await supabaseAdmin.from("task_patterns").insert({
            user_id: user.id,
            pattern_name: pattern.pattern_name,
            keywords: pattern.keywords || [],
            suggested_category: pattern.suggested_category || null,
            frequency: 1,
            last_seen: new Date().toISOString(),
          });
        }
      } else {
        await supabaseAdmin.from("task_patterns").insert({
          user_id: user.id,
          pattern_name: pattern.pattern_name,
          keywords: pattern.keywords || [],
          suggested_category: pattern.suggested_category || null,
          frequency: 1,
          last_seen: new Date().toISOString(),
        });
      }
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-meeting-consolidated error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
