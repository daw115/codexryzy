# Work Assistant Web

Docelowy dashboard i panel operacyjny dla asystenta pracy.

To nie jest klient, ktory rozmawia z `work-assistant-api` bezposrednio z przegladarki.
To jest osobny frontend/BFF:

- ma wlasne logowanie,
- trzyma `WORK_ASSISTANT_API_KEY` tylko po stronie serwera,
- renderuje widoki operacyjne na podstawie danych z `work-assistant-api`.

## Zakres MVP

- logowanie wlasciciela jednym haslem,
- overview,
- knowledge base,
- tasks,
- operations,
- server-side fetch do `work-assistant-api`.

## Environment

Skopiuj `.env.example` do `.env.local` i uzupelnij:

- `WORK_ASSISTANT_API_URL`
- `WORK_ASSISTANT_API_KEY`
- `DASHBOARD_PASSWORD_HASH`
- `DASHBOARD_SESSION_SECRET`

## Hash hasla

Hash wygenerujesz tak:

```bash
npm run hash-password -- "twoje-haslo"
```

## Local run

```bash
npm install
npm run dev
```

Dashboard uruchamia sie na `http://localhost:3001`.
