from __future__ import annotations

from dataclasses import dataclass, field

import httpx


@dataclass
class CompletionResult:
    text: str
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionsClient:
    def __init__(
        self,
        *,
        api_url: str | None,
        api_key: str | None,
        model: str | None,
    ) -> None:
        self.api_url = (api_url or "").strip()
        self.api_key = (api_key or "").strip()
        self.model = (model or "").strip()

    @property
    def enabled(self) -> bool:
        return bool(self.api_url and self.api_key and self.model)

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 1200,
    ) -> CompletionResult:
        if not self.enabled:
            raise RuntimeError("Chat completions client is not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(self.api_url, json=body, headers=headers)
            response.raise_for_status()
            payload = response.json()

        message = payload["choices"][0]["message"]["content"]
        if isinstance(message, str):
            text = message.strip()
        elif isinstance(message, list):
            parts = []
            for item in message:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
            text = "\n".join(part for part in parts if part).strip()
        else:
            raise ValueError("Chat API response did not contain a text message")

        usage = payload.get("usage") or {}
        return CompletionResult(
            text=text,
            model=payload.get("model") or self.model,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            total_tokens=int(usage.get("total_tokens") or 0),
        )
