from __future__ import annotations

import httpx


class VikunjaClient:
    def __init__(self, *, base_url: str | None, api_token: str | None) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.api_token = (api_token or "").strip()

    @property
    def enabled(self) -> bool:
        return bool(self.base_url and self.api_token)

    def _headers(self) -> dict[str, str]:
        if not self.enabled:
            raise RuntimeError("Vikunja client is not configured")
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    async def list_projects(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{self.base_url}/api/v1/projects",
                headers=self._headers(),
                params={"page": 1, "per_page": 100},
            )
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, list):
            return payload
        raise ValueError("Unexpected Vikunja projects response")

    async def list_project_tasks(self, project_id: int) -> list[dict]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{self.base_url}/api/v1/projects/{project_id}/tasks",
                headers=self._headers(),
                params={"page": 1, "per_page": 1000},
            )
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, list):
            return payload
        raise ValueError("Unexpected Vikunja project tasks response")

    async def get_task(self, task_id: int) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{self.base_url}/api/v1/tasks/{task_id}",
                headers=self._headers(),
            )
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, dict):
            return payload
        raise ValueError("Unexpected Vikunja task response")

    async def update_task(self, task_id: int, body: dict) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/api/v1/tasks/{task_id}",
                headers=self._headers(),
                json=body,
            )
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, dict):
            return payload
        raise ValueError("Unexpected Vikunja update response")

    async def create_project_task(self, project_id: int, body: dict) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.put(
                f"{self.base_url}/api/v1/projects/{project_id}/tasks",
                headers=self._headers(),
                json=body,
            )
            if response.status_code == 405:
                response = await client.post(
                    f"{self.base_url}/api/v1/projects/{project_id}/tasks",
                    headers=self._headers(),
                    json=body,
                )
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, dict):
            return payload
        raise ValueError("Unexpected Vikunja create task response")
