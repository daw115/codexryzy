from __future__ import annotations

import httpx


class EmbeddingClient:
    def __init__(
        self,
        *,
        api_url: str | None,
        api_key: str | None,
        model: str | None,
        provider: str | None,
    ) -> None:
        self.api_url = (api_url or "").strip()
        self.api_key = (api_key or "").strip()
        self.model = (model or "").strip()
        self.provider = (provider or "").strip()

    @property
    def enabled(self) -> bool:
        return bool(self.api_url and self.api_key and self.model)

    async def embed_text(self, text: str) -> list[float] | None:
        if not self.enabled:
            return None

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "input": text,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(self.api_url, json=body, headers=headers)
            response.raise_for_status()
            payload = response.json()

        if isinstance(payload.get("data"), list) and payload["data"]:
            embedding = payload["data"][0].get("embedding")
            if isinstance(embedding, list):
                return embedding

        embedding = payload.get("embedding")
        if isinstance(embedding, list):
            return embedding

        raise ValueError("Embedding API response did not contain an embedding vector")
