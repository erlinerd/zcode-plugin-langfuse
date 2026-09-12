# Contributing

Thanks for helping improve the ZCode Langfuse plugin. Please read the
[Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Development setup

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run check
npm run package:plugin
git diff --check
```

`dist/` and `artifacts/` are generated release directories and are ignored by
Git. Source changes that affect the runtime must pass
`npm run package:plugin`; the CI workflow builds the bundle, creates the ZIP,
and verifies its SHA-256 checksum. Linting uses Oxlint; run `npm run lint` or
`npm run lint:fix` when needed.

## Contribution boundaries

This plugin is intentionally:

- fail-open: telemetry must never block a ZCode session;
- Hook-payload-only: do not add transcript-file or hidden chain-of-thought
  collection;
- privacy-aware: preserve capture flags, size limits, and local-state deletion;
- dependency-conscious: prefer the official Langfuse SDK and keep runtime
  dependencies bundled and reviewable.

Do not commit Langfuse keys, personal prompts, transcripts, or private Hook
payloads. Use synthetic fixtures such as `public-key-test` and
`secret-key-test`.

## Pull requests

Keep pull requests small and explain the user-visible or runtime-facing reason
for the change. Include:

- the ZCode Hook event contract involved;
- whether the change can affect Hook latency or block a session;
- what data can be written to local state and Langfuse;
- how privacy, fail-open behavior, and generated artifacts were verified.

Use a focused title such as `fix:`, `feat:`, `docs:`, or `chore:`. Update both
English and Chinese README files when configuration or user-facing behavior
changes.

## Review checklist

Before requesting review:

- add or update tests for behavior changes;
- run `npm run check` and `npm run package:plugin`;
- verify `artifacts/plugin.zip` with its `.sha256` file;
- inspect `git diff --check` and the package contents;
- remove credentials and private data from commits, logs, and fixtures.

For release-specific work, follow [docs/releasing.md](docs/releasing.md).
