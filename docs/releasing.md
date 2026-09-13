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
   git diff --check
   ```

5. Inspect the generated `dist/` marketplace tree. It should contain the plugin
   manifest, Hook declaration, bundled runtime, third-party notices, and the
   marketplace manifest. It must not contain credentials, prompts, transcripts,
   or local state.
6. Open a pull request and wait for every CI matrix job to pass.

Everything under `dist/` is generated. It is intentionally ignored by Git and
must not be added to a source pull request; `dist/` itself is both the local
marketplace directory and the input for the reviewed marketplace
synchronization.

## Publish

Pushing an annotated tag such as `v0.2.0` runs `.github/workflows/release.yml`.
That workflow runs the unified package build, compresses the `dist/`
marketplace tree, and uploads the release assets, named
`<plugin>-v<version>.zip` plus its `.sha256` checksum:

```text
zcode-plugin-langfuse-v0.2.1.zip
zcode-plugin-langfuse-v0.2.1.zip.sha256
```

The official ZCode marketplace catalog requires an in-tree source in the form
`./plugins/<name>`. Use the generated
`dist/plugins/zcode-plugin-langfuse/` directory (the `dist/` tree is itself a
marketplace shell) as the input for a separate reviewed catalog change. Do not
replace this with a ZIP URL: the root
`marketplace.json` remains a local-development catalog pointing at
`./dist/plugins/<name>`.
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
