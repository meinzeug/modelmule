# Release Process

ModelMule releases are currently tag-based.

## Checklist

1. Update versions in:
   - `package.json`
   - `apps/*/package.json`
   - `packages/*/package.json`
   - CLI version in `apps/cli/src/index.ts`
2. Run:

```bash
pnpm release:check
```

3. Optionally create a Linux tarball:

```bash
pnpm package:linux
```

4. Commit:

```bash
git add .
git commit -m "Release vX.Y.Z"
```

5. Push main:

```bash
git push origin main
```

6. Tag and push:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

## Release Artifacts

The Linux packaging script creates:

```text
dist-linux/modelmule-X.Y.Z-linux.tar.gz
```

The tarball includes the built workspace, launcher script, and desktop entry.

## Versioning

Until `1.0`, minor versions may include API and config changes. Any such changes should be reflected in `README.md`, `CONFIG.md`, `PROVIDERS.md`, and `EXAMPLES.md`.
