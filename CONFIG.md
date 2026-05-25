# CONFIG

Konfiguration liegt standardmäßig unter:

- `~/.modelmule/config.yaml`

Optionaler Override:

- `MODELMULE_CONFIG_PATH=/custom/path/config.yaml`

## Beispiel

```yaml
providers:
  openrouter_main:
    type: openrouter
    apiKeyEnv: OPENROUTER_API_KEY
    dailyRequestLimit: 1000
    dailyBudgetUsd: 2.0
    priority: 80
    models:
      - openrouter/auto

  ollama_local:
    type: ollama
    baseUrl: http://127.0.0.1:11434
    priority: 60
    models:
      - llama3.1:8b
    isLocal: true

routing:
  defaultMode: balanced
  privacyMode: false
  tasks:
    coding:
      prefer:
        - openrouter_main
        - ollama_local
```

## Routing-Modi

- `cheapest`
- `balanced`
- `premium`
- `local-only`
- `coding-max`
- `free-first`

## Datenschutzmodus

`privacyMode: true` deaktiviert Cloud-Provider und nutzt nur lokale Provider.
