# ModelMule

ModelMule ist ein lokales Web-UI-Control-Panel fuer KI-Provider und Coding-AIs. Es startet auf deinem Rechner unter `http://127.0.0.1:43110`, stellt einen lokalen OpenAI-kompatiblen Endpunkt bereit und routet Anfragen von Tools wie Codex CLI, Claude Code, OpenCode oder Aider an die Provider, die du in der Weboberflaeche einrichtest.

Der lokale API-Endpunkt ist:

```text
http://127.0.0.1:43110/v1
```

Clients, die zwingend einen API-Key verlangen, koennen `modelmule` als Platzhalter verwenden, solange `MODELMULE_API_KEY` nicht gesetzt ist.

## Was Ist ModelMule?

ModelMule ist ein kleines lokales Control Panel fuer Coding-AI-Provider-Routing:

- Provider wie OpenRouter, OpenAI-kompatible APIs, Anthropic, Ollama, LM Studio, Gemini, Mistral, Groq, DeepSeek und Custom APIs verwalten
- API-Keys lokal speichern und in der UI nicht im Klartext zurueckgeben
- Coding-AIs erkennen und Routing-Profile zuweisen
- Codex automatisch auf den lokalen ModelMule-Endpunkt konfigurieren
- lokale, kostenlose, guenstige oder starke Modelle ueber einfache Profile bevorzugen
- Nutzung, Fallbacks und Fehler zentral sehen

ModelMule ist bewusst kleiner und lokaler als grosse Admin-Plattformen. Es soll sich anfuehlen wie ein einfaches Control Panel fuer Coding-AI-Routing, nicht wie ein YAML-Editor.

## Schnellstart

```bash
corepack enable
corepack prepare pnpm@10.22.0 --activate
pnpm install
pnpm dev
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:43110
```

Alternativ direkt den Server starten:

```bash
pnpm --filter @modelmule/cli dev serve
```

## Web-UI Oeffnen

Die Startseite zeigt dir:

- ob ModelMule lokal laeuft
- den lokalen API-Endpunkt `http://127.0.0.1:43110/v1`
- eingerichtete Provider
- erkannte Coding-AIs
- Routing-Zuweisungen pro Coding-AI
- OpenRouter-/Free-Modell-Status
- Test- und Fehlerstatus

Die wichtigsten Karten sind:

1. Provider verbinden
2. Coding-AI auswaehlen
3. Routing einstellen
4. Verbindung testen

Der Expertenbereich mit Rohkonfiguration, Backups und Debugdaten ist standardmaessig eingeklappt.

## OpenRouter Einrichten

1. Web-UI oeffnen.
2. `Provider verbinden` oder den Setup-Assistenten starten.
3. Preset `OpenRouter` waehlen.
4. OpenRouter API-Key eintragen.
5. Speichern.
6. Optional `Free First aktivieren` oder `Nur kostenlose Modelle nutzen` klicken.

ModelMule erkennt OpenRouter-Modelle mit Markern wie `:free`, `/free` oder `-free` als kostenlos und markiert sie im Modellkatalog. Free-Modelle koennen trotzdem Provider-Limits, Rate-Limits oder Ausfaelle haben. ModelMule gibt keine Garantie, dass Free-Modelle immer verfuegbar sind.

Fuer Codex und Tool-Calling bevorzugt ModelMule ein konkretes freies Coding-Modell wie `qwen/qwen3-coder:free` statt nur den generischen Alias `openrouter/free`, und nutzt Fallbacks auf weitere freie tool-faehige Modelle.

## Codex Mit ModelMule Verbinden

1. Web-UI oeffnen.
2. `Coding-AIs` aufrufen.
3. Bei `Codex CLI` pruefen, ob Codex installiert ist.
4. `Codex automatisch konfigurieren` klicken.

ModelMule schreibt dann in `~/.codex/config.toml`:

```toml
model_provider = "modelmule"
model = "qwen/qwen3-coder:free"

[model_providers.modelmule]
name = "ModelMule"
base_url = "http://127.0.0.1:43110/v1"
wire_api = "responses"
```

Vor jeder Aenderung legt ModelMule ein Backup der bestehenden Codex-Konfiguration an.

Danach sendet Codex seine Modellanfragen an ModelMule. In ModelMule kannst du dann steuern, ob Codex OpenRouter Free, OpenRouter Auto, Ollama lokal, LM Studio oder einen anderen Provider nutzt.

## OpenCode, Aider Und Claude Code Verbinden

In der Web-UI unter `Coding-AIs` siehst du fuer jedes Tool:

- installiert: ja/nein
- erkannter Pfad
- Version, falls ermittelbar
- aktuelles Routing-Profil
- aktueller Provider
- Button zum Verbinden
- Button zum Testen
- Anleitung fuer Endpoint und API-Key

Fuer OpenCode und Aider kannst du den lokalen OpenAI-kompatiblen Endpoint verwenden:

```text
Base URL: http://127.0.0.1:43110/v1
API-Key: modelmule
```

Claude Code wird erkannt und angezeigt. Wo eine automatische Konfiguration sauber moeglich ist, kann ModelMule sie nutzen. Wo ein Tool keine stabile offizielle Konfigurationsschnittstelle anbietet, zeigt ModelMule nur klare Copy/Paste-Hinweise und simuliert keine Verbindung.

## Routing-Profile

ModelMule bringt einfache Profile mit:

- `Free First`: zuerst kostenlose/lokale Modelle, danach guenstige Cloud-Modelle
- `Nur kostenlos`: nur lokale oder als free markierte Modelle
- `Beste Qualitaet`: starke Modelle bevorzugen, Kosten zweitrangig
- `Lokal/Privat`: nur lokale Provider wie Ollama oder LM Studio
- `Coding guenstig`: fuer Coding-AIs optimiert, bevorzugt freie oder guenstige Coding-Modelle
- `Coding stark`: fuer schwere Coding-Aufgaben, starke Modelle bevorzugt

Pro Coding-AI kannst du ein Profil auswaehlen, zum Beispiel:

```text
Codex nutzt: Free First
Claude Code nutzt: Beste Qualitaet
OpenCode nutzt: Nur kostenlos
Aider nutzt: Coding guenstig
```

Intern nutzt ModelMule weiter die vorhandene Routing-Engine mit Provider-Prioritaeten, Privacy-Modus, Budget-/Request-Limits und Fallbacks.

## Lokaler OpenAI-Kompatibler Endpoint

Stabile lokale Endpunkte:

- `GET /health`
- `GET /providers`
- `GET /models`
- `GET /usage`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/code`

Beispiel:

```bash
curl -s http://127.0.0.1:43110/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "taskType": "coding",
    "messages": [
      { "role": "user", "content": "Schreibe eine kleine TypeScript-Funktion." }
    ]
  }'
```

Optional kann lokale API-Authentifizierung mit `MODELMULE_API_KEY` aktiviert werden. Dann muessen Clients `x-modelmule-api-key` oder `Authorization: Bearer <token>` senden.

## Testfunktion

Die Web-UI enthaelt eine einfache Testseite:

- Testnachricht eingeben
- Tool waehlen: Codex, Claude Code, OpenCode, Aider oder Allgemein
- Routing-Profil waehlen
- Test starten
- Ergebnis, Provider, Modell und Fallback-Kette anzeigen

Fehler werden fuer normale Nutzer uebersetzt, zum Beispiel:

- `API-Key fehlt`
- `Provider nicht erreichbar`
- `Ollama laeuft nicht`
- `Codex nicht installiert`
- `Kein Modell verfuegbar`
- `Budget/Request-Limit erreicht`
- `Alle Fallbacks fehlgeschlagen`

## Sicherheit Und Secrets

- API-Keys werden nicht im Klartext an die UI zurueckgegeben.
- Provider-Keys werden serverseitig lokal unter `~/.modelmule/secrets.json` gespeichert.
- Die Secrets-Datei wird mit Dateimodus `600` geschrieben.
- Konfigurations-Export und Provider-Profile enthalten keine echten Keys aus dem Secret Store.
- Wenn ein Nutzer bewusst Rohdateien ausserhalb von ModelMule kopiert, gelten die lokalen Dateiinhalte.

## Was ModelMule Bewusst Nicht Tut

ModelMule baut keine inoffizielle ChatGPT- oder Claude-Abo-Automation.

Nicht enthalten sind:

- Cookie-Hacks
- Browser-Scraping von ChatGPT-/Claude-Web-Accounts
- Umgehen von Provider-Limits
- Account-Automation ohne offizielle API oder offizielle CLI-Unterstuetzung

Direkte Abo-Nutzung ist nur moeglich, wenn das jeweilige offizielle Tool oder eine offizielle API/CLI das sauber erlaubt.

## Entwicklung

Build:

```bash
pnpm build
```

Tests:

```bash
pnpm test
```

Release-Check:

```bash
pnpm release:check
```

Weitere Details stehen in [CONFIG.md](./CONFIG.md), [PROVIDERS.md](./PROVIDERS.md), [INSTALL.md](./INSTALL.md) und [EXAMPLES.md](./EXAMPLES.md).
