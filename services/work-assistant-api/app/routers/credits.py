from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.security import require_api_key

router = APIRouter(prefix="/v1/credits", tags=["credits"], dependencies=[Depends(require_api_key)])


class QuatarlyCredits(BaseModel):
    total_credits: int
    used_credits: int
    remaining_credits: int
    reset_date: str
    expires_at: str | None = None
    available: bool = True
    error: str | None = None


@router.get("/quatarly", response_model=QuatarlyCredits)
async def get_quatarly_credits(request: Request) -> QuatarlyCredits:
    settings = request.app.state.settings
    api_key = (settings.llm_api_key or "").strip()

    # Derive credits URL from config or llm_api_url
    base = (settings.quatarly_credits_base_url or "").strip()
    if not base and settings.llm_api_url:
        # Transform https://api.quatarly.cloud/v1/... → https://api.quatarly.cloud/v0
        import re
        base = re.sub(r"/v\d+.*$", "/v0", settings.llm_api_url.rstrip("/"))

    if not base or not api_key:
        return QuatarlyCredits(
            total_credits=0, used_credits=0, remaining_credits=0,
            reset_date="", available=False, error="Quatarly not configured",
        )

    url = f"{base}/user/credits/{api_key}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
            resp.raise_for_status()
            data = resp.json()
        return QuatarlyCredits(
            total_credits=data.get("total_credits", 0),
            used_credits=data.get("used_credits", 0),
            remaining_credits=data.get("remaining_credits", 0),
            reset_date=data.get("reset_date", ""),
            expires_at=data.get("expires_at"),
            available=True,
        )
    except Exception as exc:
        return QuatarlyCredits(
            total_credits=0, used_credits=0, remaining_credits=0,
            reset_date="", available=False, error=str(exc)[:120],
        )
