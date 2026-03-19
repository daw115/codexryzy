import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function buildMeetingContext(authHeader: string, meetingId?: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let query = supabase
    .from("meetings")
    .select("*, meeting_participants(*), action_items(*), decisions(*), transcript_lines(*)")
    .order("date", { ascending: false });

  if (meetingId) {
    query = query.eq("id", meetingId);
  } else {
    query = query.limit(50);
  }

  const { data: meetings, error } = await query;

  if (error || !meetings?.length) {
    return "No meeting data available yet. The user hasn't recorded any meetings.";
  }

  const sections = meetings.map((m: any) => {
    const participants = m.meeting_participants?.map((p: any) => p.name).join(", ") || "None listed";
    const tags = m.tags?.join(", ") || "none";
    const status = m.status || "unknown";

    let section = `## Meeting: ${m.title} (${m.date}${m.duration ? `, ${m.duration}` : ""})\nStatus: ${status}\nParticipants: ${participants}\nTags: ${tags}\n`;

    if (m.summary) {
      section += `\nSummary: ${m.summary}\n`;
    }

    if (m.decisions?.length) {
      section += `\nDecisions:\n`;
      for (const d of m.decisions) {
        section += `- ${d.decision}${d.rationale ? ` (Rationale: ${d.rationale})` : ""}${d.timestamp ? ` [${d.timestamp}]` : ""}\n`;
      }
    }

    if (m.action_items?.length) {
      section += `\nAction Items:\n`;
      for (const a of m.action_items) {
        section += `- ${a.owner}: ${a.task}${a.deadline ? ` (due ${a.deadline})` : ""}${a.completed ? " ✅ COMPLETED" : ""}\n`;
      }
    }

    if (m.transcript_lines?.length) {
      const sorted = [...m.transcript_lines].sort((a: any, b: any) => a.line_order - b.line_order);
      const lines = sorted.slice(0, 30);
      section += `\nTranscript highlights:\n`;
      for (const l of lines) {
        section += `[${l.timestamp}] ${l.speaker}: ${l.text}\n`;
      }
      if (sorted.length > 30) {
        section += `... (${sorted.length - 30} more lines)\n`;
      }
    }

    return section;
  });

  return sections.join("\n---\n\n");
}

// Transform Claude SSE stream to OpenAI-compatible SSE stream
function transformClaudeStream(claudeStream: ReadableStream): ReadableStream {
  const reader = claudeStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const event = JSON.parse(data);
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                const openaiChunk = {
                  id: "chatcmpl-claude",
                  object: "chat.completion.chunk",
                  choices: [{
                    index: 0,
                    delta: { content: event.delta.text },
                    finish_reason: null,
                  }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
              } else if (event.type === "message_stop") {
                const finalChunk = {
                  id: "chatcmpl-claude",
                  object: "chat.completion.chunk",
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: "stop",
                  }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      }
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, meetingId } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization") || "";

    // Verify the user is authenticated
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meetingContext = await buildMeetingContext(authHeader, meetingId);

    // Fetch knowledge base context
    let knowledgeContext = "";
    try {
      const kbClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: summaries } = await kbClient
        .from("knowledge_summaries")
        .select("summary_text, key_topics, project_context, sentiment, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      const { data: patterns } = await kbClient
        .from("task_patterns")
        .select("pattern_name, keywords, suggested_category, frequency")
        .order("frequency", { ascending: false })
        .limit(10);
      const { data: projects } = await kbClient
        .from("project_contexts")
        .select("name, description, keywords, meeting_count")
        .order("last_activity", { ascending: false })
        .limit(10);

      if (summaries?.length) {
        knowledgeContext += "\n\nKNOWLEDGE SUMMARIES:\n" + summaries.map((s: any) =>
          `- [${s.project_context || "?"}] ${s.summary_text} (topics: ${(s.key_topics || []).join(", ")})`
        ).join("\n");
      }
      if (patterns?.length) {
        knowledgeContext += "\n\nTASK PATTERNS:\n" + patterns.map((p: any) =>
          `- "${p.pattern_name}" (×${p.frequency}, category: ${p.suggested_category || "?"})`
        ).join("\n");
      }
      if (projects?.length) {
        knowledgeContext += "\n\nPROJECT CONTEXTS:\n" + projects.map((p: any) =>
          `- "${p.name}" (${p.meeting_count} meetings): ${p.description || ""}`
        ).join("\n");
      }
    } catch (e) {
      console.error("Knowledge context error:", e);
    }

    const scopeNote = meetingId
      ? "You are focused on ONE specific meeting. Answer questions only about this meeting's data below."
      : "You have access to the user's meeting database and knowledge base. Cite meeting titles and dates when possible.";

    const systemPrompt = `You are Cerebro, an AI meeting intelligence assistant. ${scopeNote}
If you can't find relevant info, say so.

MEETING DATA:

${meetingContext}${knowledgeContext}`;

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("Claude API error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform Claude SSE to OpenAI-compatible SSE for frontend compatibility
    const transformedStream = transformClaudeStream(response.body!);

    return new Response(transformedStream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
