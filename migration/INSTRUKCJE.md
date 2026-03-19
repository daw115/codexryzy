# Migracja Cerebro: Gemini -> Claude API

## 1. Uzyskaj klucz API Anthropic
1. Wejdz na https://console.anthropic.com
2. Zaloz konto lub zaloguj sie
3. API Keys -> Create Key
4. Skopiuj klucz (zaczyna sie od `sk-ant-...`)

## 2. Dodaj secret w Supabase
1. Supabase Dashboard -> Edge Functions -> Manage secrets
2. Dodaj nowy secret: `ANTHROPIC_API_KEY` = twoj klucz

## 3. Zamien edge functions
Podmien zawartosc kazdej edge function na pliki z katalogu `migration/functions/`:

| Plik | Co robi | Model Claude |
|------|---------|-------------|
| `chat/index.ts` | Czat RAG (Ask AI) | claude-sonnet-4-6 |
| `analyze-meeting/index.ts` | Analiza spotkania | claude-sonnet-4-6 |
| `analyze-meeting-consolidated/index.ts` | Analiza + knowledge | claude-sonnet-4-6 |
| `transcribe-slides/index.ts` | OCR slajdow, dedup, aggregate | claude-sonnet-4-6 |
| `compare-analyses/index.ts` | Porownanie analiz | claude-sonnet-4-6 |
| `build-knowledge/index.ts` | Ekstrakcja wiedzy | claude-sonnet-4-6 |
| `transcribe-audio/index.ts` | Transkrypcja audio | claude-sonnet-4-6 |

## 4. Uwaga: transkrypcja audio
Claude nie przetwarza audio bezposrednio (w przeciwienstwie do Gemini).
Zmodyfikowana wersja transcribe-audio wysyla tylko tekst promptu z metadanymi
i oczekuje transkrypcji na podstawie kontekstu (slajdow/klatek).
Dla pelnej transkrypcji audio rozważ:
- Web Speech API w przegladarce (juz czesciowo zaimplementowane jako captions)
- OpenAI Whisper API jako osobny krok

## 5. Kluczowe zmiany techniczne

### Endpoint
- BYLO: `https://ai.gateway.lovable.dev/v1/chat/completions`
- JEST: `https://api.anthropic.com/v1/messages`

### Autoryzacja
- BYLO: `Authorization: Bearer ${LOVABLE_API_KEY}`
- JEST: `x-api-key: ${ANTHROPIC_API_KEY}` + `anthropic-version: 2023-06-01`

### Format obrazow
- BYLO: `{ type: "image_url", image_url: { url: "data:mime;base64,..." } }`
- JEST: `{ type: "image", source: { type: "base64", media_type: "mime", data: "..." } }`

### Tool calling
- BYLO: `tools: [{ type: "function", function: { name, parameters } }]`
- JEST: `tools: [{ name, description, input_schema }]`

### Tool choice
- BYLO: `tool_choice: { type: "function", function: { name: "..." } }`
- JEST: `tool_choice: { type: "tool", name: "..." }`

### Odczyt wyniku
- BYLO: `aiResult.choices[0].message.tool_calls[0].function.arguments` (string JSON)
- JEST: `aiResult.content.find(b => b.type === "tool_use").input` (juz obiekt)

### Streaming (chat)
- Claude uzywa innego formatu SSE niz OpenAI
- Zmodyfikowana wersja chat/index.ts zawiera transformer SSE Claude->OpenAI
  aby frontend nie wymegal zmian
