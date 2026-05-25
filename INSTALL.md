# Installation

This project is a TypeScript monorepo managed with `pnpm`.

## Requirements

- Node.js `>=20`
- Corepack
- `pnpm` `10.22.0`
- A C/C++ build toolchain if `better-sqlite3` needs to build from source on your platform

## Setup

Enable Corepack and install the pinned `pnpm` version:

```bash
corepack enable
corepack prepare pnpm@10.22.0 --activate
```

Install dependencies:

```bash
pnpm install --no-frozen-lockfile
```

## Initialize Local Config

```bash
pnpm --filter @modelmule/cli dev init
```

Default files:

- config: `~/.modelmule/config.yaml`
- database: `~/.modelmule/modelmule.db`

## Development Server

Start the local API server:

```bash
pnpm --filter @modelmule/cli dev serve
```

Default address:

```text
http://127.0.0.1:43110
```

Local web console:

```text
http://127.0.0.1:43110/
```

## Build

```bash
pnpm build
```

## Test

```bash
pnpm test
```

## Useful Development Commands

```bash
pnpm lint
pnpm dev:server
pnpm dev:cli
pnpm release:check
pnpm package:linux
```

## Provider Setup

Cloud providers require regular API credentials configured through environment variables.

Example:

```bash
export OPENROUTER_API_KEY=...
export ANTHROPIC_API_KEY=...
```

Local providers such as Ollama must be running separately before ModelMule can call them.

CLI providers such as Codex CLI or Claude CLI must be installed and authenticated separately before ModelMule can call them through stdin/stdout.

## Optional Local API Auth

Set `MODELMULE_API_KEY` before starting the server:

```bash
export MODELMULE_API_KEY=change-me
pnpm --filter @modelmule/cli dev serve
```

Clients can authenticate with either:

```text
x-modelmule-api-key: change-me
Authorization: Bearer change-me
```

## Linux Tarball

Create a local Linux tarball:

```bash
pnpm package:linux
```

Output:

```text
dist-linux/modelmule-<version>-linux.tar.gz
```

## Troubleshooting

If `pnpm build` cannot find `tsc`, dependencies are probably not installed:

```bash
pnpm install --no-frozen-lockfile
```

If SQLite native bindings fail to install, verify that your platform has the required build tools and Node.js version.

If the server is unreachable, confirm host and port settings:

```bash
echo "$MODELMULE_HOST"
echo "$MODELMULE_PORT"
```

If provider calls fail, run:

```bash
modelmule providers test
modelmule route test coding
```

If a config change breaks startup or routing, inspect the local backup directory next to `config.yaml` or use the web console backup list after the server starts with a valid config.

If API calls return `401`, confirm `MODELMULE_API_KEY` and send the same value as `x-modelmule-api-key`.
