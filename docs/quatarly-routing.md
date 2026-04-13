# Quatarly Routing Notes

## Claude Code / CLI

If you want Anthropic-compatible clients to route through Quatarly:

```bash
export ANTHROPIC_API_KEY="YOUR_QUATARLY_API_KEY"
export ANTHROPIC_BASE_URL="https://api.quatarly.cloud/v0"
```

The backend in this repo accepts these aliases and normalizes the URL to `/chat/completions`.

## Work Assistant API / Worker

Preferred explicit vars:

```text
LLM_API_URL=https://api.quatarly.cloud/v0/chat/completions
LLM_API_KEY=YOUR_QUATARLY_API_KEY
LLM_MODEL=claude-sonnet-4-6-20250929
```

## LibreChat

`librechat.yaml` custom Quatarly endpoint uses:

```yaml
baseURL: "https://api.quatarly.cloud/v0"
apiKey: "${ANTHROPIC_API_KEY}"
```

Code Interpreter and Web Search are separate tools and still require their own keys:

- `LIBRECHAT_CODE_API_KEY`
- `SERPER_API_KEY`
- `FIRECRAWL_API_KEY`
- `JINA_API_KEY` (or `COHERE_API_KEY`)
