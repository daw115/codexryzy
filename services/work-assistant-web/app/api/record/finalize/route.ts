import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";
import { ingestMeetingAnalysis } from "@/lib/api";

type FinalizeRequest = {
  title: string;
  meeting_date?: string;
  project?: string;
  slide_texts: string[];
  transcript_lines: string[];
};

type ActionItem = {
  title: string;
  owner: string | null;
  due_at: string | null;
  description: string | null;
};

type MeetingAnalysis = {
  summary: string;
  action_items: ActionItem[];
  decisions: string[];
  key_topics: string[];
};

type AnthropicMessage = {
  content: Array<{ type: string; text: string }>;
};

function buildPrompt(body: FinalizeRequest): string {
  const slideSection =
    body.slide_texts.length > 0
      ? `## Slajdy zaprezentowane podczas spotkania:\n${body.slide_texts
          .map((s, i) => `### Slajd ${i + 1}:\n${s}`)
          .join("\n\n")}`
      : "";

  const transcriptSection =
    body.transcript_lines.length > 0
      ? `## Transkrypt spotkania:\n${body.transcript_lines.join("\n")}`
      : "";

  return `Przeanalizuj poniższe spotkanie i zwróć WYŁĄCZNIE poprawny JSON (bez markdown, bez backticks).

Spotkanie: "${body.title}"
Data: ${body.meeting_date ?? "nieznana"}
${body.project ? `Projekt: ${body.project}` : ""}

${slideSection}

${transcriptSection}

Zwróć JSON w tej dokładnej strukturze:
{
  "summary": "2-4 zdania streszczające najważniejsze punkty spotkania",
  "action_items": [
    {
      "title": "konkretne zadanie do wykonania",
      "owner": "imię osoby odpowiedzialnej lub null",
      "due_at": "YYYY-MM-DD lub null",
      "description": "dodatkowe szczegóły lub null"
    }
  ],
  "decisions": ["podjęta decyzja 1", "podjęta decyzja 2"],
  "key_topics": ["temat 1", "temat 2", "temat 3"]
}

Zasady:
- action_items: tylko konkretne zadania z jasnym właścicielem lub terminem, nie ogólniki
- decisions: tylko fakty decyzyjne, nie opinie
- key_topics: max 5 głównych tematów
- Odpowiadaj po polsku jeśli spotkanie jest po polsku, po angielsku jeśli po angielsku`;
}

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

  let body: FinalizeRequest;
  try {
    body = (await request.json()) as FinalizeRequest;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ detail: "Missing meeting title" }, { status: 400 });
  }

  // Generate structured analysis with Claude
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
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: buildPrompt(body),
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

  let analysis: MeetingAnalysis;
  try {
    analysis = JSON.parse(rawText) as MeetingAnalysis;
  } catch {
    return NextResponse.json(
      { detail: "Failed to parse LLM response as JSON", raw: rawText },
      { status: 502 },
    );
  }

  // Push to knowledge base
  const intake = await ingestMeetingAnalysis({
    title: body.title,
    project: body.project,
    meeting_date: body.meeting_date,
    summary: analysis.summary,
    transcript: body.transcript_lines.join("\n"),
    tasks: analysis.action_items.map((item) => ({
      title: item.title,
      description: item.description ?? undefined,
      owner: item.owner ?? undefined,
      due_at: item.due_at ?? undefined,
    })),
  });

  return NextResponse.json({ analysis, intake });
}
