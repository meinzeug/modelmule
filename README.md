# ModelMule

ModelMule is a local compatibility layer for AI-enabled developer tools. It exposes a small OpenAI-compatible API on the local machine and forwards requests to configured, authorized providers according to local policy.

The project is intended for development environments where configuration, provider selection, usage visibility, and local privacy controls should be handled in one place.

## Status

ModelMule is early-stage software. The current codebase provides a working local server, CLI, provider abstraction, routing engine, fallback behavior, and SQLite usage tracking.

Public interfaces may still change before a stable `1.0` release. Configuration and API changes should be documented in this repository as they are introduced.

## Scope

ModelMule is designed for:

- local development workflows
- provider-authorized API usage
- OpenAI-compatible client integration
- local and cloud provider configuration
- usage tracking and operational diagnostics
- privacy-oriented local routing policies

ModelMule should only be used with services, credentials, models, and local commands that the operator is authorized to use. Local routing, fallback, and reporting features are operational controls; they do not override provider terms, quotas, billing rules, or access restrictions.

## Features

- Local Fastify server on `http://127.0.0.1:43110`
- OpenAI-compatible `POST /v1/chat/completions`
- Simple coding helper endpoint at `POST /v1/code`
- Provider support for OpenRouter, Ollama, OpenAI-compatible APIs, Anthropic, and local shell commands
- Routing by task type, provider priority, privacy mode, daily budget, and daily request limits
- Provider fallback when an eligible provider call fails
- Route preview endpoint for diagnostics
- SQLite usage store for requests, costs, errors, models, and fallback events
- CLI for initialization, server startup, provider diagnostics, usage reporting, and route inspection

## Quickstart

Install dependencies:

```bash
corepack enable
corepack prepare pnpm@10.22.0 --activate
pnpm install --no-frozen-lockfile
```

Initialize the default configuration:

```bash
pnpm --filter @modelmule/cli dev init
```

Start the local server:

```bash
pnpm --filter @modelmule/cli dev serve
```

Use the local OpenAI-compatible base URL:

```text
http://127.0.0.1:43110/v1
```

Most local clients still require an API key field. For ModelMule itself, any placeholder value is sufficient unless the client enforces its own validation.

## API

Available endpoints:

- `GET /health`
- `GET /providers`
- `GET /models`
- `GET /usage`
- `POST /route/test`
- `POST /v1/chat/completions`
- `POST /v1/code`

Example request:

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

## CLI

Common commands:

```bash
modelmule init
modelmule serve
modelmule chat "What is TypeScript?"
modelmule code "Build a Fastify route"
modelmule providers list
modelmule providers add openrouter
modelmule providers add ollama
modelmule providers add openai_compatible
modelmule providers add anthropic
modelmule providers add shell_command
modelmule providers test
modelmule models list
modelmule usage
modelmule config edit
modelmule route test coding
```

## Configuration

The default configuration path is:

```text
~/.modelmule/config.yaml
```

Override it with:

```bash
MODELMULE_CONFIG_PATH=/custom/path/config.yaml
```

See [CONFIG.md](./CONFIG.md) for the schema, examples, routing modes, and environment variables.

## Providers

Supported provider types:

- `openrouter`
- `ollama`
- `openai_compatible`
- `anthropic`
- `shell_command`

Provider-specific details are documented in [PROVIDERS.md](./PROVIDERS.md).

## Architecture

Repository layout:

- `apps/cli`: command-line interface
- `apps/server`: local Fastify API server
- `packages/config`: configuration loading and validation
- `packages/core`: routing, service logic, and SQLite storage
- `packages/providers`: provider runtime implementations
- `tests`: routing, fallback, config, and endpoint coverage

The intended extension points are provider runtimes, routing policy, storage reporting, and additional local diagnostics.

## Development

Build:

```bash
pnpm build
```

Test:

```bash
pnpm test
```

More setup details are available in [INSTALL.md](./INSTALL.md).

## Compatibility Notes

- Runtime target: Node.js `>=20`
- Package manager: `pnpm`
- Local database: SQLite through `better-sqlite3`
- Primary API shape: OpenAI-compatible chat completions
- Configuration format: YAML

## Roadmap

Near-term areas for improvement:

- stronger request and response validation
- clearer error codes for clients
- provider capability metadata
- richer usage reports
- migration handling for configuration and storage changes
- documented release process
- optional authentication for local deployments that need it

The roadmap is intentionally operational: changes should improve reliability, transparency, and maintainability without weakening provider terms or local policy boundaries.
