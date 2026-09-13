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
   (cd artifacts && shasum -a 256 -c *.sha256)
   git diff --check
   ```

5. Inspect both generated outputs. The ZIP should contain only the plugin
   manifest, Hook declaration, bundled runtime, third-party notices, and the
   marketplace manifest (so the extracted directory can be added directly as
   a local marketplace). The catalog-ready layout should contain the same
   bundle plus its manifests, documentation, license, and marketplace entry.
   Neither output may contain credentials, prompts, transcripts, or local state.
6. Open a pull request and wait for every CI matrix job to pass.

`dist/` and `artifacts/` are generated directories. They are intentionally
ignored by Git and must not be added to a source pull request. The catalog-ready
layout is under `artifacts/plugin-layout/` and is the input for a reviewed
marketplace synchronization.

## Publish

Pushing an annotated tag such as `v0.2.0` runs `.github/workflows/release.yml`.
That workflow runs the unified package build and uploads these release assets,
named `<plugin>-v<version>.zip` plus its `.sha256` checksum:

```text
zcode-plugin-langfuse-v0.2.1.zip
zcode-plugin-langfuse-v0.2.1.zip.sha256
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

## Sync the catalog fork

Push the catalog-ready layout to the `erlinerd/zcode-plugins` fork without
manual copying:

```bash
npm run sync:catalog -- \
  --repo /path/to/zcode-plugins \
  --branch feat/langfuse-observability
```

The command validates the layout first, then mirrors `plugins/<name>`, updates
the catalog entry in `marketplace.json`, and commits
`chore(catalog): sync zcode-plugin-langfuse v<version>`. Add `--dry-run` to
print the plan without writing anything, and `--push` to run
`git push origin <branch>` after the commit. Re-running the same version is a
no-op; a dirty fork or a missing branch stops with recovery guidance.

## Automatic catalog sync

Pushing a SemVer tag (`v*.*.*`) also runs `.github/workflows/catalog-sync.yml`,
which builds with the same `npm run package:plugin` command and runs the sync
against `erlinerd/zcode-plugins`. The workflow never touches the Release
workflow; a catalog failure stays red on its own. It also supports a manual
trial run that publishes no release:

```bash
gh workflow run catalog-sync.yml
```

First-time setup requires one fine-grained personal access token with
**Contents: Read and write** limited to `erlinerd/zcode-plugins`, stored as a
repository secret:

```bash
gh secret set CATALOG_SYNC_PAT
```

The token is only used in the fork clone URL and is masked by GitHub in logs;
the workflow checks out the source repository with `persist-credentials:
false`. If the workflow fails, it reports the failing step: a missing or
expired token points back to the secret setup above, and any sync failure can
always be reproduced locally with `npm run sync:catalog` and the recovery
hints printed by the script.
