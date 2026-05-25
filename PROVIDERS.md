# PROVIDERS

## Unterstützte Provider-Typen

- `openrouter`
- `ollama`
- `openai_compatible`
- `anthropic`
- `shell_command`

## Gemeinsame Felder

- `type`
- `priority`
- `dailyRequestLimit` (optional)
- `dailyBudgetUsd` (optional)
- `models` (optional)
- `isLocal` (optional)

## OpenRouter

- `apiKeyEnv` nötig (z. B. `OPENROUTER_API_KEY`)
- optional `baseUrl` (default: `https://openrouter.ai/api/v1`)

## Ollama

- optional `baseUrl` (default: `http://127.0.0.1:11434`)
- für Privacy-Workloads als `isLocal: true`

## OpenAI-kompatibel

- `baseUrl` und optional `apiKeyEnv`

## Anthropic

- `apiKeyEnv` nötig
- optional `baseUrl` (default: `https://api.anthropic.com`)

## ShellCommand

- `command` nötig
- optional `args`
- für lokal installierte CLI-Tools
