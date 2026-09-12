# Security

Please do not report credentials, transcript contents, or private Hook payloads
in a public issue.

## Reporting a vulnerability

Use the hosting platform's private security reporting channel or contact the
repository maintainers privately. Include:

- a concise description and impact;
- affected plugin and ZCode versions;
- safe reproduction steps using synthetic values;
- any suggested mitigation.

Do not attach Langfuse public or secret keys, real prompts, transcripts, or
unredacted logs. If a credential may have been exposed, revoke or rotate it
before reporting and mention only that rotation occurred.

## Supported versions

Before `1.0.0`, security fixes are provided on a best-effort basis for the
latest released version. Users should upgrade to the latest release and rerun
`npm run build` when installing from source.

| Version | Security support |
| --- | --- |
| Latest `0.x` | Best effort |
| Older releases | Not guaranteed |

## Data-handling assumptions

- Credentials are read from local ZCode/plugin configuration or process
  environment and are never written to Hook stdout.
- Prompt, tool input, and tool output capture can be disabled independently.
- Captured fields are bounded by `LANGFUSE_MAX_CAPTURE_CHARS`.
- The plugin does not open transcript files or collect hidden chain-of-thought.
- Local per-session state is removed after a completed `Stop` turn.
- Langfuse failures are fail-open: telemetry may be lost, but the ZCode session
  must continue.

The implementation details are documented in [DESIGN.md](DESIGN.md). Dependency
updates should be reviewed with `npm audit --omit=dev` and the generated bundle
should be inspected for accidental data or credential inclusion.
