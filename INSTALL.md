# INSTALL

## Voraussetzungen

- Node.js LTS (>=20 empfohlen)
- Corepack aktiviert
- pnpm

## Installation

```bash
corepack enable
corepack prepare pnpm@10.22.0 --activate
pnpm install --no-frozen-lockfile
```

## Build

```bash
pnpm build
```

## Tests

```bash
pnpm test
```

## Start

```bash
pnpm --filter @modelmule/cli dev init
pnpm --filter @modelmule/cli dev serve
```
