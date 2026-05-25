# ModelMule

ModelMule is a local AI routing layer for developer tooling. It exposes one OpenAI-compatible interface on your machine and routes requests to the right model provider based on privacy, budget, priority, and fallback rules.

It is designed for teams and individual developers who want a stable local endpoint for editors, agents, scripts, and internal tools without hardwiring every integration to a single model vendor.

## What It Does

- Runs a local API server on `http://127.0.0.1:43110`
- Accepts OpenAI-style chat completion requests
- Routes requests across multiple AI providers
- Supports privacy-first local routing with Ollama or shell-based tools
- Applies provider priority, daily budget, and request-limit constraints
- Falls back automatically when a provider fails
- Tracks usage, errors, and fallback events in local SQLite storage
- Includes a CLI for setup, operations, and diagnostics

## Why Use It

Most coding tools assume a single model API. That creates vendor lock-in, weak failure handling, and poor operational visibility.

ModelMule solves that by placing a local control plane between your tools and your providers:

- One endpoint for many tools
- One routing policy for many providers
- One local usage record across cloud and local models
- One fallback path when a provider is unavailable

## Product Positioning

ModelMule is not a hosted gateway and not a prompt playground. It is a local infrastructure component for AI-enabled developer workflows.

Typical use cases:

- Point coding agents at one stable OpenAI-compatible base URL
- Prefer local inference for sensitive work
- Use cloud models only when quality or context length requires it
- Cap daily spend per provider
- Keep working through rate limits or provider outages

## Core Capabilities

### Local OpenAI-Compatible API

ModelMule provides:

- `POST /v1/chat/completions`
- `POST /v1/code`
- `GET /health`
- `GET /providers`
- `GET /models`
- `GET /usage`
- `POST /route/test`

This allows existing OpenAI-compatible clients to talk to ModelMule without provider-specific integration logic.

### Provider Routing

Requests can be routed by:

- default mode
- task type
- provider priority
- privacy mode
- daily budget limits
- daily request limits
- configured provider preference order

If the first provider fails, ModelMule automatically tries the next eligible provider.

### Local Usage Tracking

Usage is persisted in SQLite and includes:

- request counts
- token counts
- estimated cost
- provider errors
- fallback events
- frequently used models

## Supported Provider Types

- `openrouter`
- `ollama`
- `openai_compatible`
- `anthropic`
- `shell_command`

See [PROVIDERS.md](./PROVIDERS.md) for provider-specific settings.

## Quickstart

### 1. Install

See [INSTALL.md](./INSTALL.md).

### 2. Initialize Configuration

```bash
pnpm --filter @modelmule/cli dev init
```

This creates the default config at `~/.modelmule/config.yaml`.

### 3. Configure Providers

Example:

```yaml
providers:
  openrouter_main:
    type: openrouter
    apiKeyEnv: OPENROUTER_API_KEY
    priority: 80
    dailyBudgetUsd: 2.0
    models:
      - openrouter/auto

  ollama_local:
    type: ollama
    baseUrl: http://127.0.0.1:11434
    priority: 60
    isLocal: true
    models:
      - llama3.1:8b

routing:
  defaultMode: balanced
  privacyMode: false
  tasks:
    coding:
      prefer:
        - openrouter_main
        - ollama_local
```

More details: [CONFIG.md](./CONFIG.md)

### 4. Start the Server

```bash
pnpm --filter @modelmule/cli dev serve
```

### 5. Point Your Tool at ModelMule

Use:

- `base_url=http://127.0.0.1:43110/v1`
- `api_key=dummy-local-key`

Your tool now talks to ModelMule, and ModelMule decides which provider should handle the request.

## CLI

Examples:

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

More examples: [EXAMPLES.md](./EXAMPLES.md)

## Routing Modes

ModelMule currently supports:

- `cheapest`
- `balanced`
- `premium`
- `local-only`
- `coding-max`
- `free-first`

Task types can further refine routing behavior:

- `coding`
- `refactor`
- `debugging`
- `planning`
- `cheap-chat`
- `long-context`
- `local-private`
- `premium-reasoning`

## Architecture

Monorepo structure:

- `apps/cli`: command-line interface
- `apps/server`: local Fastify API server
- `packages/config`: config loading and validation
- `packages/core`: routing, service logic, storage
- `packages/providers`: provider runtimes
- `tests`: routing, fallback, config, and endpoint coverage

## Safety and Scope

ModelMule is intended for legal, explicit, provider-supported usage only.

It does not include:

- subscription bypassing
- hidden login automation
- CAPTCHA evasion
- scraping around provider controls
- unauthorized access to commercial model endpoints

## Current Status

ModelMule is an early-stage local infrastructure project with a working MVP foundation:

- local server
- CLI
- provider abstraction
- routing engine
- fallback logic
- usage storage

The product surface is already usable for experimentation and internal workflows, but it should still be treated as actively evolving software.
