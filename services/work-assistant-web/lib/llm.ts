import Anthropic from "@anthropic-ai/sdk";

/**
 * Creates an Anthropic SDK client pointed at the Quatarly proxy.
 *
 * Quatarly is a Claude-compatible API proxy. The SDK is initialised with
 * `baseURL` set to `LLM_API_URL` so all requests go to
 * `${LLM_API_URL}/v1/messages` — the same endpoint used by the raw-fetch
 * calls this replaces.
 *
 * Throws if the required env vars are absent so callers can surface a 500.
 */
export function createLLMClient(): { client: Anthropic; model: string } {
  const apiUrl = process.env.LLM_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY?.trim();
  const model = process.env.LLM_MODEL?.trim() ?? "claude-opus-4-6";

  if (!apiUrl || !apiKey) {
    throw new Error("LLM_API_URL and LLM_API_KEY must be set");
  }

  const client = new Anthropic({ apiKey, baseURL: apiUrl });

  return { client, model };
}
