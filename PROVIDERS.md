# Providers

Providers are configured backends that ModelMule can call through a common runtime interface.

All providers must be used according to their own terms, credentials, quotas, and operational limits. ModelMule only applies local policy and forwarding behavior.

## Supported Types

- `openrouter`
- `ollama`
- `openai_compatible`
- `anthropic`
- `shell_command`

## Common Fields

- `type`: provider type
- `priority`: integer from `0` to `100`
- `dailyRequestLimit`: optional local request cap
- `dailyBudgetUsd`: optional local budget cap
- `models`: optional list of model IDs
- `isLocal`: optional explicit local-provider flag
- `apiKeyEnv`: optional environment variable name for API keys
- `baseUrl`: optional provider base URL
- `timeoutMs`: optional timeout for shell command providers

## OpenRouter

Example:

```yaml
openrouter_main:
  type: openrouter
  apiKeyEnv: OPENROUTER_API_KEY
  baseUrl: https://openrouter.ai/api/v1
  priority: 80
  dailyBudgetUsd: 2.0
  models:
    - openrouter/auto
```

Notes:

- `apiKeyEnv` is required for chat requests.
- `baseUrl` defaults to `https://openrouter.ai/api/v1`.
- Model listing uses the configured `models` list when provided.

## Ollama

Example:

```yaml
ollama_local:
  type: ollama
  baseUrl: http://127.0.0.1:11434
  priority: 60
  isLocal: true
  models:
    - llama3.1:8b
```

Notes:

- `baseUrl` defaults to `http://127.0.0.1:11434`.
- Ollama is treated as local by default.
- The Ollama service must be running separately.

## OpenAI-Compatible

Example:

```yaml
openai_compatible_main:
  type: openai_compatible
  baseUrl: https://api.openai.com/v1
  apiKeyEnv: OPENAI_API_KEY
  priority: 75
  models:
    - gpt-4.1-mini
```

Notes:

- `baseUrl` should point to a regular OpenAI-compatible API.
- `apiKeyEnv` is optional for local gateways, but most hosted APIs require it.
- Requests use the OpenAI chat completions shape.

## Anthropic

Example:

```yaml
anthropic_main:
  type: anthropic
  apiKeyEnv: ANTHROPIC_API_KEY
  priority: 75
  models:
    - claude-3-5-sonnet-latest
```

Notes:

- `apiKeyEnv` is required for chat requests.
- `baseUrl` defaults to `https://api.anthropic.com`.
- ModelMule converts local chat messages into the provider request shape used by this runtime.

## Shell Command

Example:

```yaml
local_command:
  type: shell_command
  command: /bin/cat
  args: []
  timeoutMs: 120000
  priority: 40
  isLocal: true
  models:
    - shell-command-model
```

Notes:

- `command` is required.
- The command receives the prompt on stdin.
- Stdout is returned as the assistant response.
- Non-zero exits are treated as provider errors and can trigger fallback.
- `timeoutMs` defaults to `120000`.
- Shell command providers are treated as local by default.
- Only configure commands that are safe and appropriate for your environment.

## Codex CLI Template

The `codex_cli` template creates a `shell_command` provider:

```yaml
codex_local:
  type: shell_command
  command: codex
  args:
    - exec
    - "-"
  timeoutMs: 600000
  priority: 65
  isLocal: true
  models:
    - codex-cli
```

The prompt is sent to stdin. The template expects the local `codex` command to be installed and already authenticated by the operator.

## Claude CLI Template

The `claude_cli` template creates a `shell_command` provider:

```yaml
claude_local:
  type: shell_command
  command: claude
  args:
    - -p
  timeoutMs: 600000
  priority: 65
  isLocal: true
  models:
    - claude-cli
```

The prompt is sent to stdin. The template expects the local `claude` command to be installed and already authenticated by the operator.

## Health Checks

The `modelmule providers test` command calls provider health checks through the local server.

Health checks are best-effort diagnostics. A healthy response means the runtime can perform its configured check, not that every future model request is guaranteed to succeed.

Shell command providers verify that the configured command is available on `PATH` or as an executable path. They do not run a model request during health checks.

## Model Listing

Model lists are sourced from provider configuration when `models` is set. Some providers can query their remote or local API when no static model list is configured.

Prefer explicit `models` lists for predictable local behavior.

## Capability Metadata

The local API exposes provider and routing capabilities through:

```text
GET /capabilities
```

This includes provider types, provider templates, routing modes, and task types. GUI clients should prefer this endpoint over hard-coded option lists.

## Adding Provider Types

Provider implementations live in `packages/providers`.

A provider runtime must implement:

- `listModels()`
- `healthCheck()`
- `chat(request)`

It should also define whether it is local, how it resolves models, and how it reports usage when the upstream API provides usage fields.

Minimal implementation shape:

```ts
class ExampleProvider extends BaseProvider {
  async listModels() {
    return ['example-model'];
  }

  async healthCheck() {
    return { healthy: true };
  }

  async chat(request) {
    return createResponse('example-model', 'response');
  }
}
```

Provider capability scoring is exposed through `/providers` under the `capabilities` field. The score currently combines priority, health, locality, static model configuration, and local limits.

## Operational Boundaries

- Do not put API keys directly in config files.
- Do not configure providers for services you are not authorized to use.
- Do not rely on local limits as a substitute for provider-side controls.
- Review shell commands carefully before sharing configuration.
