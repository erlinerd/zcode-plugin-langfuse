# Design notes

## Runtime seam

ZCode launches a new process for each hook event. The process receives one JSON
object on stdin and must emit one JSON object on stdout. Therefore the plugin
cannot keep an in-memory trace across events. `JsonStateStore` is the persistent
seam between those processes.

The state file is scoped by a SHA-256 key derived from `session_id`, written
with a temporary file plus rename, and protected by a short-lived per-session
lock. The raw session ID is never used as a filename. State is removed when the
`Stop` event has been converted into a completed turn.

## Turn state machine

```text
SessionStart       -> create or refresh session state
UserPromptSubmit   -> start/replace current turn
PreToolUse         -> append an open tool call
PostToolUse        -> close tool call with output
PostToolUseFailure -> close tool call with error
Stop               -> build completed turn, clear state, publish asynchronously
```

`Stop` is the only event that talks to Langfuse. This keeps hook latency for
prompt/tool events local and makes the Langfuse adapter replaceable in tests.
Each completed turn is emitted as a trace named `ZCode Turn`. If a `Stop` event
arrives without earlier state, the plugin still emits a minimal trace containing
the session and final assistant message.

## Privacy boundary

`TurnTracker` applies capture flags and size limits before writing state. This
means metadata-only mode does not leave prompt or tool content in the local
state directory while a turn is in progress. `LangfuseTraceSink` only receives
the already-sanitized `CompletedTurn` domain object.

The plugin intentionally does not open `transcript_path`: transcript formats
are runtime-owned, and reading them would create a second, harder-to-audit
collection path.

## Failure policy

The hook entry point catches all tracker and adapter failures, writes `{}` to
stdout, and exits successfully. The only diagnostic detail allowed by default
is none; with `debug` enabled it writes event names, session IDs, and error
class names to stderr. It never prints configuration values or payload bodies.
Configuration precedence is process environment, then persisted ZCode
`plugins.options` selected by `ZCODE_PLUGIN_ID`, then documented defaults.

A failed Langfuse request can lose that turn's telemetry, but it cannot prevent
ZCode from continuing. The current version intentionally chooses fail-open over
an on-disk retry queue so that a stuck telemetry service cannot create a local
backlog or increase hook latency. A future retry queue would need an explicit
retention and deletion policy before being added.

## SDK packaging

Source code imports the official `langfuse` JavaScript SDK. `esbuild` bundles
that SDK into the sealed entry `dist/plugins/zcode-plugin-langfuse/hooks/entry.mjs`,
because ZCode plugin installation does not promise a runtime `npm install`.
`scripts/build.mjs` stages the marketplace shell and the official-layout plugin
directory; `.github/workflows/release.yml` zips the shell into the versioned
release asset. `dist/` is generated locally and is not committed;
CI verifies the ZIP checksum. `npm run validate` checks source manifests and
`npm run validate:artifact` checks the generated bundle.
