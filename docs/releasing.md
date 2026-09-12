# Releasing

This repository ships a ZCode plugin through a versioned ZIP artifact rather
than as an npm runtime package. Source code stays in Git; CI builds `dist/`,
packages the required files, calculates a SHA-256 checksum, and uploads the ZIP
for the release.

## Prepare a release

1. Create a release branch from the default branch.
2. Choose a SemVer version and update it in all four locations:
   - `package.json`
   - `package-lock.json`
   - `.zcode-plugin/plugin.json`
   - `marketplace.json`
3. Update `CHANGELOG.md` by moving the relevant `Unreleased` entries into a
   dated release section.
4. Install from the lockfile and run the package gate:

   ```bash
   npm ci
   npm run check
   npm run package:plugin
   (cd artifacts && shasum -a 256 -c plugin.zip.sha256)
   git diff --check
   ```

5. Inspect the ZIP contents. It should contain only the plugin manifests, Hook
   declaration, bundled runtime, and source map; it must not contain source
   credentials, prompts, transcripts, or local state.
6. Open a pull request and wait for every CI matrix job to pass.

`dist/` and `artifacts/` are generated directories. They are intentionally
ignored by Git and must not be added to a source pull request.

## Publish

Pushing an annotated tag such as `v0.2.0` runs `.github/workflows/release.yml`.
That workflow builds and uploads these release assets:

```text
plugin.zip
plugin.zip.sha256
```

The official ZCode marketplace catalog should reference the immutable ZIP with
its checksum, following the format used by the official marketplace:

```json
{
  "name": "langfuse-observability",
  "version": "0.2.0",
  "source": {
    "source": "url",
    "type": "zip",
    "url": "https://github.com/OWNER/REPOSITORY/releases/download/v0.2.0/plugin.zip",
    "sha256": "COPY_THE_VALUE_FROM_plugin.zip.sha256",
    "path": "langfuse-observability"
  }
}
```

Update the official catalog in a separate reviewed change when the release URL
and checksum are available. The repository's root `marketplace.json` remains a
local-development catalog using `source: "."`; run `npm run build` before
installing it from a local directory.

After publishing:

1. Install the exact version in a clean ZCode session.
2. Run a synthetic prompt/tool/stop smoke test.
3. Confirm the trace is named `ZCode Turn`, Hook stdout remains `{}`, and local
   state is cleaned up.

Do not include Langfuse credentials or real user content in release notes,
artifacts, screenshots, or smoke-test fixtures.
