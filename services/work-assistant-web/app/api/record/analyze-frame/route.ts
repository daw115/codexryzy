import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";
import { createLLMClient } from "@/lib/llm";

type FrameAnalysis = {
  slide_text: string | null;
  transcript_lines: string[];
};

const ANALYZE_PROMPT = `You are analyzing a screenshot from a Microsoft Teams meeting.

The image typically contains:
1. A PowerPoint/slide presentation in the upper or center area
2. A Teams live transcript panel at the BOTTOM with WHITE text on a BLACK background

Extract and return ONLY valid JSON (no markdown, no code fences):
{
  "slide_text": "all visible text from the slide or presentation area, or null if no slide",
  "transcript_lines": ["speaker: text line 1", "speaker: text line 2"]
}

Rules:
- slide_text: extract ALL text visible in the presentation/slide area — title, bullets, labels, annotations. Preserve structure with newlines.
- transcript_lines: extract only lines from the black transcript panel at the bottom. Include speaker names if visible. Each distinct speaker turn = one array item.
- If no slide/presentation is visible, set slide_text to null.
- If no black transcript panel is visible, set transcript_lines to [].
- Return ONLY the JSON object. No explanation, no markdown.`;

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let client: Anthropic;
  let model: string;
  try {
    ({ client, model } = createLLMClient());
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "LLM not configured" },
      { status: 500 },
    );
  }

  let body: { frame?: string };
  try {
    body = (await request.json()) as { frame?: string };
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const { frame } = body;
  if (!frame) {
    return NextResponse.json({ detail: "Missing frame" }, { status: 400 });
  }

  // Strip data URL prefix, keep only base64 payload
  const base64Data = frame.includes(",") ? frame.split(",")[1] : frame;

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64Data },
            },
            { type: "text", text: ANALYZE_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((c): c is Anthropic.TextBlock => c.type === "text");
    const rawText = textBlock?.text ?? "{}";

    const parsed = JSON.parse(rawText) as Partial<FrameAnalysis>;
    const result: FrameAnalysis = {
      slide_text: typeof parsed.slide_text === "string" ? parsed.slide_text : null,
      transcript_lines: Array.isArray(parsed.transcript_lines)
        ? parsed.transcript_lines.filter((l): l is string => typeof l === "string")
        : [],
    };
    return NextResponse.json(result);
  } catch {
    // Malformed JSON from model → return empty rather than 502
    return NextResponse.json({ slide_text: null, transcript_lines: [] });
  }
}
