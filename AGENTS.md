# Agent instructions

These instructions apply to the entire repository.

## Mission

Maintain a reviewable, fail-open ZCode plugin that sends one Langfuse trace per
completed turn. Preserve the privacy boundary: collect only fields delivered
by ZCode Hook stdin, never hidden chain-of-thought or transcript-file content.

## Work sequence

1. **Orient.** Read the relevant source module, its tests, and the applicable
   section of `README.md`, `README.zh-CN.md`, or `DESIGN.md` before editing.
   Check `.zcode-plugin/plugin.json` and `hooks/hooks.json` for manifest or Hook
   contract changes. Completion: the change has a named source owner, test
   surface, and documented runtime contract.
2. **Implement narrowly.** Keep the existing layers: `src/domain/` for types
   and payload extraction, `src/application/` for state/configuration,
   `src/adapters/` for I/O, and `src/hooks/` for the thin fail-open entrypoint.
   Add or update focused tests in `test/`. Completion: the smallest useful
   source and test diff implements the requested behavior.
3. **Package.** If runtime source or manifests change, run
   `npm run package:plugin`. Keep versions synchronized in `package.json`,
   `package-lock.json`, `.zcode-plugin/plugin.json`, and `marketplace.json`.
   Completion: the versioned release ZIP and its checksum exist under `artifacts/`, and
   `npm run validate:artifact` reports success.
4. **Verify.** Run the complete gate below and inspect the final diff for
   credentials, private payloads, unsupported Hook events, and accidental
   collection paths. Completion: every command passes and no unresolved
   diagnostic remains.

## Runtime contracts

- The process Hook receives one JSON object on stdin and emits one JSON object
  on stdout. Keep normal stdout compatible with ZCode; diagnostics belong on
  stderr.
- `Stop` is the only Hook event that publishes to Langfuse. New traces are
  named `ZCode Turn`; tool calls are spans and the assistant response is a
  generation.
- The entrypoint is fail-open: malformed input, local state errors, missing
  credentials, and Langfuse failures must not block ZCode.
- Configuration precedence is process environment, then persisted ZCode
  `plugins.options` selected by `ZCODE_PLUGIN_ID`, then documented defaults.
- Capture flags, size limits, atomic state handling, and post-`Stop` state
  cleanup are privacy contracts. Preserve them when changing tracking logic.
- Never add transcript reads or hidden chain-of-thought collection. Never place
  real Langfuse keys, prompts, transcripts, or Hook payloads in source, tests,
  logs, screenshots, or documentation.

## Source of truth

- Plugin metadata and user configuration: `.zcode-plugin/plugin.json`.
- Marketplace registration: `marketplace.json`.
- Hook declarations: `hooks/hooks.json`.
- Generated local installation files: `dist/`; release output: the versioned
  ZIP and checksum under `artifacts/` (named `<plugin>-v<version>.zip`). Do not
  hand-edit or commit generated artifacts.
- User-facing behavior: keep `README.md` (English) and `README.zh-CN.md`
  (Simplified Chinese) synchronized when configuration or behavior changes.
- Release procedure: read `docs/releasing.md` for versioning or publication.
- Vulnerability handling: read `SECURITY.md` before reporting or changing
  security-sensitive behavior.

## Verification gate

```bash
npm run check
npm run package:plugin
(cd artifacts && shasum -a 256 -c *.sha256)
npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=high
git diff --check
```

For a runtime change, also run a synthetic Hook smoke test with fake
credentials and confirm stdout remains `{}` and local test state is cleaned up.
Never use production credentials or real user content for this test.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`.
See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default labels: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, and `wontfix`.
See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository: use root `CONTEXT.md` and
`docs/adr/` when those files exist.
See `docs/agents/domain.md`.
