# Configuration

ModelMule uses a YAML configuration file for providers and routing policy.

Default path:

```text
~/.modelmule/config.yaml
```

Override path:

```bash
MODELMULE_CONFIG_PATH=/custom/path/config.yaml
```

## Minimal Example

```yaml
providers:
  ollama_local:
    type: ollama
    baseUrl: http://127.0.0.1:11434
    priority: 60
    isLocal: true
    models:
      - llama3.1:8b

routing:
  defaultMode: local-only
  privacyMode: true
  tasks:
    coding:
      prefer:
        - ollama_local
```

## Mixed Provider Example

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

  codex_local:
    type: shell_command
    command: codex
    args:
      - exec
      - "-"
    timeoutMs: 600000
    priority: 65
    models:
      - codex-cli
    isLocal: true

routing:
  defaultMode: balanced
  privacyMode: false
  tasks:
    coding:
      prefer:
        - openrouter_main
        - ollama_local
    local-private:
      prefer:
        - ollama_local
```

## Top-Level Fields

- `providers`: map of provider IDs to provider configuration
- `routing`: default routing policy and task-specific preferences

Provider IDs are local names. Keep them stable because usage data and routing events refer to them.

## Provider Fields

- `type`: required provider type
- `priority`: integer from `0` to `100`
- `apiKeyEnv`: optional environment variable name for API keys
- `baseUrl`: optional provider base URL
- `dailyRequestLimit`: optional local daily request limit
- `dailyBudgetUsd`: optional local daily budget limit
- `models`: optional list of preferred or available models
- `command`: required for `shell_command`
- `args`: optional arguments for `shell_command`
- `timeoutMs`: optional timeout for `shell_command` calls
- `isLocal`: optional explicit local-provider flag

Local budget and request limits are client-side controls. They do not replace provider-side billing, quota, or rate-limit enforcement.

## Routing Fields

- `defaultMode`: default routing mode
- `privacyMode`: when true, only local providers are eligible
- `tasks`: optional task-specific provider preference lists

## Routing Modes

- `balanced`: use configured priority and task preferences
- `cheapest`: prefer providers with lower configured daily budget values
- `premium`: prefer non-local providers when eligible
- `local-only`: only local providers are intended to be used
- `coding-max`: prefer provider types expected to work well for coding tasks
- `free-first`: prefer providers configured with lower cost exposure

Routing modes are local selection hints. They do not imply any provider-side entitlement.

## Task Types

Recognized task types:

- `coding`
- `refactor`
- `debugging`
- `planning`
- `cheap-chat`
- `long-context`
- `local-private`
- `premium-reasoning`

Unknown task types are normalized to `coding`.

## Environment Variables

- `MODELMULE_CONFIG_PATH`: override config file path
- `MODELMULE_DB_PATH`: override SQLite database path
- `MODELMULE_HOST`: server host, default `127.0.0.1`
- `MODELMULE_PORT`: server port, default `43110`
- `MODELMULE_RATE_LIMIT_WINDOW_MS`: local server rate-limit window
- `MODELMULE_RATE_LIMIT_MAX_REQUESTS`: local server max requests per window

Provider API keys are read from the environment variable named by each provider's `apiKeyEnv`.

## Privacy Mode

Set `privacyMode: true` to make only local providers eligible. Providers are considered local when `isLocal: true` is set or when the provider runtime marks the type as local.

Recommended local provider types:

- `ollama`
- `shell_command`

## Provider Templates

The CLI and local web console can add templates for common provider setups:

- `openrouter`
- `ollama`
- `openai_compatible`
- `anthropic`
- `shell_command`
- `codex_cli`
- `claude_cli`

`codex_cli` and `claude_cli` are stored as `shell_command` providers. The configured CLI must already be installed and authenticated by the operator.

## Operational Notes

- Keep API keys out of the YAML file. Use environment variables through `apiKeyEnv`.
- Keep provider IDs stable once usage tracking matters.
- Prefer explicit `models` lists when predictable routing is important.
- Use `modelmule route test <taskType>` to inspect routing decisions before sending real requests.
- Treat config changes as operational changes and review them before shared deployments.
