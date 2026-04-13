from fastapi import Header, HTTPException, Request, status


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    configured_key = request.app.state.settings.app_api_key
    if not configured_key:
        return
    if x_api_key == configured_key:
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
    )
