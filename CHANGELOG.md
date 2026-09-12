# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/).

The version must stay synchronized in `package.json`,
`.zcode-plugin/plugin.json`, and `marketplace.json`.

## [Unreleased]

- Improve repository governance, validation, and contribution documentation.
- Switch distribution to CI-built ZIP artifacts with SHA-256 checksums.
- Rename new Langfuse traces to `ZCode Turn`.

## [0.1.1] — 2026-09-13

- Enforced HTTPS-only Langfuse endpoints and environment-first configuration.
- Kept every captured value within `max_capture_chars`, including tiny limits.
- Added third-party dependency license and provenance notices.

## [0.1.0] — 2026-09-12

- Initial community ZCode plugin implementation.
- Added session, prompt, tool, and stop Hook integration.
- Added Langfuse JavaScript SDK adapter with bundled distributable output.
- Added fail-open handling, privacy controls, bounded capture, atomic state, and offline tests.
