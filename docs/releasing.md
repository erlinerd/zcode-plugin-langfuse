# Releasing

This repository ships a ZCode plugin through two generated distribution
outputs: a versioned ZIP artifact and a catalog-ready plugin layout. Source code
stays in Git; the default `npm run package:plugin` command builds `dist/` once,
packages the required files, calculates a SHA-256 checksum, and creates both
outputs.

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

5. Inspect both generated outputs. The ZIP should contain only the plugin
   manifest, Hook declaration, bundled runtime, and third-party notices. The
   catalog-ready layout should contain the same bundle plus its manifests,
   documentation, license, and marketplace entry. Neither output may contain
   credentials, prompts, transcripts, or local state.
6. Open a pull request and wait for every CI matrix job to pass.

`dist/` and `artifacts/` are generated directories. They are intentionally
ignored by Git and must not be added to a source pull request. The catalog-ready
layout is under `artifacts/plugin-layout/` and is the input for a reviewed
marketplace synchronization.

## Publish

Pushing an annotated tag such as `v0.2.0` runs `.github/workflows/release.yml`.
That workflow runs the unified package build and uploads these release assets:

```text
plugin.zip
plugin.zip.sha256
```

The official ZCode marketplace catalog requires an in-tree source in the form
`./plugins/<name>`. Use the generated
`artifacts/plugin-layout/plugins/zcode-plugin-langfuse/` directory and
`artifacts/plugin-layout/marketplace-entry.json` as the inputs for a separate
reviewed catalog change. Do not replace this with a ZIP URL: the root
`marketplace.json` remains a local-development catalog using `source: "."`.
Run `npm run build` before installing the local-development catalog.

After publishing:

1. Install the exact version in a clean ZCode session.
2. Run a synthetic prompt/tool/stop smoke test.
3. Confirm the trace is named `ZCode Turn`, Hook stdout remains `{}`, and local
   state is cleaned up.

Do not include Langfuse credentials or real user content in release notes,
artifacts, screenshots, or smoke-test fixtures.
