import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meetingId, geminiAnalysis, chatgptAnalysis } = await req.json();
    if (!meetingId) throw new Error("meetingId is required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Build comparison prompt
    const prompt = `Jesteś ekspertem od analizy spotkań. Otrzymujesz dwie niezależne analizy tego samego spotkania:

ANALIZA 1 (Gemini):
${JSON.stringify(geminiAnalysis, null, 2)}

ANALIZA 2 (ChatGPT):
${JSON.stringify(chatgptAnalysis, null, 2)}

ZADANIE:
1. Porównaj obie analizy — znajdź różnice i podobieństwa
2. Oceń która analiza była lepsza i dlaczego
3. Stwórz zagregowaną analizę łączącą najlepsze elementy obu źródeł`;

    const contentParts = [{ type: "text", text: prompt }];

    const tools = [{
      type: "function",
      function: {
        name: "save_comparison",
        description: "Save the comparison and merged analysis",
        parameters: {
          type: "object",
          properties: {
            comparison: {
              type: "object",
              properties: {
                differences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string", description: "Pole/aspekt różnicy" },
                      gemini_value: { type: "string" },
                      chatgpt_value: { type: "string" },
                      verdict: { type: "string", description: "Która wersja lepsza i dlaczego" },
                    },
                    required: ["field", "gemini_value", "chatgpt_value", "verdict"],
                  },
                },
                similarities: {
                  type: "array",
                  items: { type: "string" },
                  description: "Wspólne elementy obu analiz",
                },
                better_source: {
                  type: "string",
                  enum: ["gemini", "chatgpt", "equal"],
                  description: "Która analiza ogólnie lepsza",
                },
                better_source_reasoning: { type: "string", description: "Dlaczego ta analiza jest lepsza" },
              },
              required: ["differences", "similarities", "better_source", "better_source_reasoning"],
            },
            merged_analysis: {
              type: "object",
              properties: {
                summary: { type: "string" },
                sentiment: { type: "string", enum: ["pozytywny", "neutralny", "negatywny", "mieszany"] },
                participants: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
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
                      slide_content: { type: "string" },
                      discussion_context: { type: "string" },
                    },
                    required: ["slide_content"],
                  },
                },
              },
              required: ["summary", "sentiment", "tags", "action_items", "decisions"],
            },
          },
          required: ["comparison", "merged_analysis"],
        },
      },
    }];

    const response = await callClaude(ANTHROPIC_API_KEY, contentParts, tools, "save_comparison");

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
      console.error("Compare error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const result = extractToolInput(aiResult);
    if (!result) {
      return new Response(JSON.stringify({ error: "AI did not return comparison" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save merged analysis
    await supabase.from("meeting_analyses").insert({
      meeting_id: meetingId,
      source: "merged",
      analysis_json: {
        ...result.merged_analysis,
        comparison: result.comparison,
      },
    });

    // Apply merged analysis to meeting tables
    const merged = result.merged_analysis;
    const { data: { user } } = await supabase.auth.getUser();

    const summaryText = merged.sentiment
      ? `[${merged.sentiment.toUpperCase()}] ${merged.summary}`
      : merged.summary;

    await supabase.from("meetings").update({
      summary: summaryText,
      tags: merged.tags || [],
      status: "analyzed",
    }).eq("id", meetingId);

    if (merged.participants?.length) {
      // Clear existing, add new
      const newP = merged.participants.map((name: string) => ({ meeting_id: meetingId, name }));
      await supabase.from("meeting_participants").insert(newP);
    }

    if (merged.action_items?.length && user) {
      const items = merged.action_items.map((ai: any) => ({
        meeting_id: meetingId,
        user_id: user.id,
        task: ai.task,
        owner: ai.owner || "Nieprzypisane",
        deadline: ai.deadline || null,
      }));
      await supabase.from("action_items").insert(items);
    }

    if (merged.decisions?.length) {
      const decs = merged.decisions.map((d: any) => ({
        meeting_id: meetingId,
        decision: d.decision,
        rationale: d.rationale || null,
        timestamp: d.timestamp || null,
      }));
      await supabase.from("decisions").insert(decs);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compare error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
