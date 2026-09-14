# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/).

The version must stay synchronized in `package.json`,
`.zcode-plugin/plugin.json`, `.claude-plugin/plugin.json`, and
`marketplace.json`.

## [0.2.2] — 2026-09-14

- Dist finalized as a marketplace shell (`marketplace.json` →
  `./plugins/<name>`) whose plugin directory matches the official template
  layout: sealed bundle at `hooks/entry.mjs`, `.claude-plugin/plugin.json`
  compatibility copy, dual-language README, license, and third-party notices.
- Removed the `payload/` nesting and the artifact `package.json`; the release
  ZIP command now matches the generated tree again.
- Root `marketplace.json` points at `./dist/plugins/<name>`, so the repository
  checkout itself can be added as a local marketplace after a build.
- `sync-catalog` mirrors the official-layout plugin directory; the fork
  `.gitignore` whitelist workaround is gone.
- Tests: added bundle execution smoke (fail-open Stop hook, state cleanup) and
  release ZIP shape coverage; 28 tests total.

## [0.2.1] — 2026-09-13

- Unified distribution: `npm run package:plugin` builds the release ZIP and a
  catalog-ready plugin layout from a single bundle.
- Added `sync-catalog` for idempotent plugin-catalog fork synchronization with
  a `--dry-run` plan mode and tracked-file guards against ignored bundles.
- Added tag-triggered `catalog-sync.yml` for automatic catalog
  synchronization, independent from the Release workflow.
- Hardened layout assembly with output-path containment and tracked-file
  verification.

## [0.2.0] — 2026-09-13

- Improve repository governance, validation, and contribution documentation.
- Switch distribution to CI-built ZIP artifacts with SHA-256 checksums.
- Rename new Langfuse traces to `ZCode Turn`.
- Shared the plugin identifier as a single `PLUGIN_ID` constant pinned to the
  packaged manifests by a test.
- Unified the plugin, marketplace, package, and repository identifiers as
  `zcode-plugin-langfuse` and released this as `0.2.0`.

## [0.1.1] — 2026-09-13

- Enforced HTTPS-only Langfuse endpoints and environment-first configuration.
- Kept every captured value within `max_capture_chars`, including tiny limits.
- Added third-party dependency license and provenance notices.

## [0.1.0] — 2026-09-12

- Initial community ZCode plugin implementation.
- Added session, prompt, tool, and stop Hook integration.
- Added Langfuse JavaScript SDK adapter with bundled distributable output.
- Added fail-open handling, privacy controls, bounded capture, atomic state, and offline tests.
