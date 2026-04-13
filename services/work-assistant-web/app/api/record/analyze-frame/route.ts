import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";

type FrameRequest = {
  frame: string;
};

type FrameAnalysis = {
  slide_text: string | null;
  transcript_lines: string[];
};

type AnthropicMessage = {
  content: Array<{ type: string; text: string }>;
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

  const apiUrl = process.env.LLM_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY?.trim();
  const model = process.env.LLM_MODEL?.trim() ?? "claude-sonnet-4-6-20250929";

  if (!apiUrl || !apiKey) {
    return NextResponse.json({ detail: "LLM_API_URL and LLM_API_KEY must be set" }, { status: 500 });
  }

  let body: FrameRequest;
  try {
    body = (await request.json()) as FrameRequest;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const { frame } = body;
  if (!frame) {
    return NextResponse.json({ detail: "Missing frame" }, { status: 400 });
  }

  // Strip data URL prefix, keep only base64 payload
  const base64Data = frame.includes(",") ? frame.split(",")[1] : frame;

  let llmResponse: Response;
  try {
    llmResponse = await fetch(`${apiUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: ANALYZE_PROMPT,
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { detail: `LLM request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!llmResponse.ok) {
    const errText = await llmResponse.text();
    return NextResponse.json({ detail: `LLM error ${llmResponse.status}: ${errText}` }, { status: 502 });
  }

  const llmData = (await llmResponse.json()) as AnthropicMessage;
  const rawText = llmData.content.find((c) => c.type === "text")?.text ?? "{}";

  try {
    const parsed = JSON.parse(rawText) as Partial<FrameAnalysis>;
    const result: FrameAnalysis = {
      slide_text: typeof parsed.slide_text === "string" ? parsed.slide_text : null,
      transcript_lines: Array.isArray(parsed.transcript_lines)
        ? parsed.transcript_lines.filter((l): l is string => typeof l === "string")
        : [],
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ slide_text: null, transcript_lines: [] });
  }
}
