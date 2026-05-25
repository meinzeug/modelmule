# Examples

These examples assume the server is running locally and providers are configured with regular credentials or local runtimes.

Start the server:

```bash
pnpm --filter @modelmule/cli dev serve
```

## CLI

Initialize config:

```bash
modelmule init
```

Send a chat prompt:

```bash
modelmule chat "What is TypeScript?"
```

Send a coding prompt:

```bash
modelmule code "Build a Fastify route."
```

Inspect configured providers:

```bash
modelmule providers list
```

Add provider templates:

```bash
modelmule providers add openrouter
modelmule providers add ollama
modelmule providers add openai_compatible
modelmule providers add anthropic
modelmule providers add shell_command
modelmule providers add codex_cli
modelmule providers add claude_cli
```

Check provider health:

```bash
modelmule providers test
```

List models:

```bash
modelmule models list
```

Show local usage:

```bash
modelmule usage
```

Inspect route selection:

```bash
modelmule route test coding
modelmule route test local-private
```

Edit config:

```bash
modelmule config edit
```

## API

Local web console:

```text
http://127.0.0.1:43110/
```

Health check:

```bash
curl http://127.0.0.1:43110/health
```

List providers:

```bash
curl http://127.0.0.1:43110/providers
```

List models:

```bash
curl http://127.0.0.1:43110/models
```

Show usage:

```bash
curl http://127.0.0.1:43110/usage
```

Preview routing:

```bash
curl -s http://127.0.0.1:43110/route/test \
  -H 'content-type: application/json' \
  -d '{
    "taskType": "coding"
  }'
```

OpenAI-compatible chat completion:

```bash
curl -s http://127.0.0.1:43110/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "openrouter/auto",
    "taskType": "coding",
    "messages": [
      {
        "role": "user",
        "content": "Write a small TypeScript function."
      }
    ]
  }'
```

Coding helper endpoint:

```bash
curl -s http://127.0.0.1:43110/v1/code \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "Create a Fastify route that returns a health response."
  }'
```

## Local-Only Example

Use an Ollama provider with privacy mode:

```yaml
providers:
  ollama_local:
    type: ollama
    baseUrl: http://127.0.0.1:11434
    priority: 70
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

Then inspect the route:

```bash
modelmule route test coding
```

## CLI Provider Example

Codex CLI over stdin/stdout:

```yaml
providers:
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

routing:
  defaultMode: balanced
  privacyMode: false
  tasks:
    coding:
      prefer:
        - codex_local
```

Claude CLI over stdin/stdout:

```yaml
providers:
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
