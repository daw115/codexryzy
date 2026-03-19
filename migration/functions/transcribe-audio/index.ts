import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    // NOTE: Claude cannot process audio. The audioBase64 parameter is accepted for API
    // compatibility but is NOT sent to Claude. This function relies on slides/frames
    // context only. For actual audio transcription, use a dedicated STT service
    // (e.g., Whisper) and pass the resulting text to Claude for structuring.
    const { audioBase64, mimeType = "audio/mpeg", language = "pl", frames = [] } = await req.json();

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // frames: optional array of { base64: string, timestamp: string }
    const hasFrames = Array.isArray(frames) && frames.length > 0;
    console.log(`Frames provided: ${hasFrames ? frames.length : 0}`);
    console.log("NOTE: Audio is not processed by Claude — relying on slides/frames context only");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Check base64 size for informational purposes (audio is not sent to Claude)
    const estimatedBytes = (audioBase64.length * 3) / 4;
    const estimatedMB = estimatedBytes / (1024 * 1024);
    console.log(`Audio size: ~${estimatedMB.toFixed(1)} MB (not sent to Claude)`);

    const languageName = language === "pl" ? "polski" : language === "en" ? "angielski" : language;

    // Build content parts — slides/frames only, no audio
    const parts: any[] = [];

    if (hasFrames) {
      parts.push({
        type: "text",
        text: `Jesteś profesjonalnym transkrybentem. Poniżej masz ${frames.length} klatek/slajdów z nagrania spotkania.

UWAGA: Audio nie jest dostępne w tym trybie. Na podstawie treści widocznej na slajdach/klatkach:
1. Odczytaj CAŁĄ widoczną treść tekstową z każdego slajdu/klatki
2. Jeśli widoczne są napisy (live captions) — odczytaj je i przypisz mówców
3. Rozpoznaj różnych mówców jeśli to możliwe (na podstawie napisów)
4. Dodaj znaczniki czasowe na podstawie timestampów klatek
5. Zachowaj naturalną interpunkcję
6. Język: ${languageName}

Zwróć transkrypcję jako strukturyzowane dane.`,
      });

      for (const frame of frames.slice(0, 10)) {
        parts.push({ type: "text", text: `--- Slajd @ ${frame.timestamp || "?"} ---` });
        parts.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${frame.base64}` },
        });
      }
    } else {
      // No frames and no audio processing — return a notice
      return new Response(
        JSON.stringify({
          error: "Claude cannot process audio directly. Provide frames/slides for visual transcription, or use a dedicated STT service (e.g., Whisper) for audio transcription.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tools = [{
      type: "function",
      function: {
        name: "save_transcript",
        description: "Save the structured transcript of the audio recording",
        parameters: {
          type: "object",
          properties: {
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  timestamp: { type: "string", description: "Timestamp in MM:SS format" },
                  speaker: { type: "string", description: "Speaker label e.g. Mówca 1" },
                  text: { type: "string", description: "Transcribed text" },
                },
                required: ["timestamp", "speaker", "text"],
              },
            },
            full_text: { type: "string", description: "Full transcript as plain text" },
            detected_language: { type: "string", description: "Detected language code" },
            speakers_count: { type: "number", description: "Number of distinct speakers detected" },
          },
          required: ["lines", "full_text"],
        },
      },
    }];

    const response = await callClaude(ANTHROPIC_API_KEY, parts, tools, "save_transcript");

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — spróbuj za chwilę." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Brak kredytów AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const transcript = extractToolInput(aiResult);

    if (!transcript) {
      // Fallback: return empty structured response
      return new Response(
        JSON.stringify({
          lines: [],
          full_text: "No transcript available — audio cannot be processed by Claude. Use slides/frames or a dedicated STT service.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(transcript), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-audio error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
