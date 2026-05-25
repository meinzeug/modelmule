# ModelMule

ModelMule ist ein lokaler Open-Source-KI-Router für Entwickler. Er bündelt mehrere KI-Zugänge hinter einer einheitlichen lokalen API und CLI.

## Warum nützlich?

- Ein lokaler OpenAI-kompatibler Endpoint für viele Coding-Tools
- Automatisches Routing nach Kosten, Qualität, Privacy und Verfügbarkeit
- Fallbacks bei Fehlern oder Rate-Limits
- Lokales Usage-Tracking mit SQLite

## MVP-Features

- TypeScript/Node.js Monorepo mit `pnpm`
- CLI (`modelmule`)
- Lokaler Fastify-Server auf `http://127.0.0.1:43110`
- OpenAI-kompatibler Endpoint: `POST /v1/chat/completions`
- Provider-System mit OpenRouter, Ollama, OpenAI-kompatibel, Anthropic, ShellCommand
- Routing-Engine (Budget/Privacy/Fallback)
- Lokales Usage-Tracking in SQLite

## Schnellstart

1. Installation: siehe [INSTALL.md](./INSTALL.md)
2. Konfiguration: siehe [CONFIG.md](./CONFIG.md)
3. Provider einrichten: siehe [PROVIDERS.md](./PROVIDERS.md)
4. Beispiele: siehe [EXAMPLES.md](./EXAMPLES.md)

### OpenRouter einbinden

- In `~/.modelmule/config.yaml` einen Provider vom Typ `openrouter` konfigurieren
- `apiKeyEnv: OPENROUTER_API_KEY` setzen
- Environment Variable exportieren:

```bash
export OPENROUTER_API_KEY=...
```

### Ollama einbinden

- Lokalen Provider vom Typ `ollama` konfigurieren
- Standard-URL: `http://127.0.0.1:11434`
- Mit `privacyMode=true` nur lokale Provider nutzen

### Coding-Tool über lokalen Endpoint verbinden

Nutze ModelMule als OpenAI-kompatiblen Proxy:

- `base_url=http://127.0.0.1:43110/v1`
- `api_key=dummy-local-key`

Das Tool spricht dann lokal mit ModelMule; ModelMule routed intern zum passenden Provider.

## Rechtliche Grenzen

ModelMule enthält **keine** Funktionen zum Umgehen von Abo-Limits, Terms of Service, versteckten Login-Flows, Captcha-Automatisierung oder illegalem Scraping.
Unterstützt werden ausschließlich legal nutzbare APIs/Provider und lokal installierte offizielle Tools.
