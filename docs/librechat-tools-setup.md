# LibreChat Tools Setup (Railway)

## Problem który widzisz

Jeśli w UI pojawia się modal:

- `Uruchom kod AI` z prośbą o klucz,
- `Wyszukiwanie w Sieci` z polami Serper/Firecrawl/Jina,

to znaczy, że serwer LibreChat nie ma ustawionych globalnych kluczy narzędzi i UI przechodzi na tryb per-user.

## Co ustawić w Railway (LibreChat service -> Variables)

Minimalnie:

```text
LIBRECHAT_CODE_API_KEY=...
SERPER_API_KEY=...
FIRECRAWL_API_KEY=...
JINA_API_KEY=...
```

Opcjonalnie:

```text
FIRECRAWL_API_URL=https://api.firecrawl.dev
COHERE_API_KEY=...   # alternatywa dla Jina reranker
```

## Skąd klucze

- Code Interpreter: [code.librechat.ai](https://code.librechat.ai)
- Serper: [serper.dev](https://serper.dev)
- Firecrawl: [firecrawl.dev](https://firecrawl.dev)
- Jina AI: [jina.ai](https://jina.ai)

## Po zmianie env

1. Zrób redeploy/restart serwisu LibreChat.
2. Otwórz nowe okno incognito i zaloguj się ponownie.
3. W Agents włącz narzędzie `Execute Code`.
4. Test prompt:

```text
Policz medianę z [4,8,15,16,23,42] i zapisz wynik.
```

Jeśli dalej pyta o klucz w UI, env nie zostały poprawnie podpięte do aktywnego deploymentu.
