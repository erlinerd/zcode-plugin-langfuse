#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { isStrictChild, validatePluginRoot } from "./build-layout.mjs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultLayoutRoot = resolve(root, "dist");
const defaultBranch = "feat/langfuse-observability";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function git(repoPath, args) {
  try {
    return execFileSync("git", args, {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message.split("\n").slice(0, 4).join(" ")
        : String(error);
    throw new Error(`git ${args[0]} failed in ${repoPath}: ${reason}`, {
      cause: error,
    });
  }
}

async function listRelativeFiles(dirPath) {
  const files = [];
  const pending = [dirPath];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(relative(dirPath, entryPath).split(sep).join("/"));
      }
    }
  }
  return files;
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label}: ${reason}`, { cause: error });
  }
}

async function assertSyncableRepo(repoPath, branch) {
  assert(
    existsSync(repoPath),
    `Repository not found: ${repoPath}. Clone the fork first, e.g. gh repo clone erlinerd/zcode-plugins.`,
  );
  git(repoPath, ["rev-parse", "--is-inside-work-tree"]);

  try {
    execFileSync(
      "git",
      ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
      {
        cwd: repoPath,
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
  } catch {
    throw new Error(
      `Branch ${branch} does not exist in ${repoPath}. Create it from the catalog default branch before syncing.`,
    );
  }

  const status = git(repoPath, ["status", "--porcelain"]);
  assert(
    status.trim() === "",
    `Working tree of ${repoPath} is not clean. Commit or stash local changes before syncing.`,
  );
}

async function planCatalogChange(repoPath, pluginName, entry) {
  const catalogPath = resolve(repoPath, "marketplace.json");
  assert(
    existsSync(catalogPath),
    `marketplace.json not found in ${repoPath}. The target must be a zcode-plugins catalog checkout.`,
  );
  const catalog = await readJson(catalogPath, "catalog marketplace.json");
  assert(
    Array.isArray(catalog.plugins),
    "catalog marketplace.json must contain a plugins array",
  );
  const existingIndex = catalog.plugins.findIndex(
    (candidate) => candidate && candidate.name === pluginName,
  );
  const unchanged =
    existingIndex >= 0 &&
    JSON.stringify(catalog.plugins[existingIndex]) === JSON.stringify(entry);
  return { catalogPath, catalog, existingIndex, unchanged };
}

async function syncCatalog({
  layoutRoot = defaultLayoutRoot,
  repo,
  branch = defaultBranch,
  dryRun = false,
  push = false,
  log = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  const repoPath = resolve(repo);
  const resolvedLayoutRoot = resolve(layoutRoot);

  assert(
    existsSync(resolvedLayoutRoot),
    `Plugin layout not found: ${resolvedLayoutRoot}. Run npm run package:plugin first.`,
  );
  const validated = await validatePluginRoot(resolvedLayoutRoot);
  const marketplace = await readJson(
    resolve(resolvedLayoutRoot, "marketplace.json"),
    "marketplace manifest",
  );
  const entry = marketplace.plugins[0];

  const pluginSourceRoot = validated.pluginRoot;
  const pluginTargetRoot = resolve(repoPath, "plugins", validated.name);
  const pluginPathspec = `plugins/${validated.name}`;
  const mirroredItems = [
    ".zcode-plugin",
    ".claude-plugin",
    "hooks",
    "README.md",
    "README_CN.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ];
  assert(
    isStrictChild(repoPath, pluginTargetRoot),
    `Plugin target must stay inside the repository: ${pluginTargetRoot}`,
  );

  await assertSyncableRepo(repoPath, branch);
  if (!dryRun) git(repoPath, ["checkout", branch]);

  const catalogPlan = await planCatalogChange(repoPath, validated.name, entry);
  let pluginFileCount = 0;
  for (const item of mirroredItems) {
    const itemPath = resolve(pluginSourceRoot, item);
    const stats = await lstat(itemPath).catch(() => null);
    if (stats?.isDirectory()) {
      pluginFileCount += (await listRelativeFiles(itemPath)).length;
    } else if (stats?.isFile()) {
      pluginFileCount += 1;
    }
  }
  const commitMessage = `chore(catalog): sync ${validated.name} v${validated.version}`;
  const entryAction =
    catalogPlan.existingIndex >= 0 ? "replace entry" : "add entry";

  log(`sync-catalog plan for ${validated.name}@${validated.version}`);
  log(`  repo: ${repoPath}`);
  log(`  branch: ${branch}`);
  log(`  layout: ${resolvedLayoutRoot}`);
  log(
    `  ${dryRun ? "would mirror" : "mirroring"}: plugins/${validated.name} (${pluginFileCount} files)`,
  );
  log(
    `  ${dryRun ? "would update" : "updating"}: ${relative(repoPath, catalogPlan.catalogPath) || "marketplace.json"} (${entryAction})`,
  );
  log(`  ${dryRun ? "would commit" : "committing"}: ${commitMessage}`);
  log(
    `  ${dryRun ? "would push" : "pushing"}: ${push ? `origin ${branch}` : "skipped (--push not set)"}`,
  );

  if (dryRun) {
    return {
      plugin: validated.name,
      version: validated.version,
      repo: repoPath,
      branch,
      dryRun: true,
      changed: null,
      commit: null,
      pushed: false,
    };
  }

  await rm(pluginTargetRoot, { recursive: true, force: true });
  await mkdir(pluginTargetRoot, { recursive: true });
  for (const item of mirroredItems) {
    await cp(resolve(pluginSourceRoot, item), resolve(pluginTargetRoot, item), {
      recursive: true,
    });
  }

  if (!catalogPlan.unchanged) {
    const { catalog, existingIndex } = catalogPlan;
    if (existingIndex >= 0) {
      catalog.plugins[existingIndex] = entry;
    } else {
      catalog.plugins.push(entry);
    }
    await writeFile(
      catalogPlan.catalogPath,
      `${JSON.stringify(catalog, null, 2)}\n`,
    );
  }

  const status = git(repoPath, ["status", "--porcelain"]);
  const layoutFiles = await listRelativeFiles(pluginTargetRoot);
  const tracked = new Set(
    git(repoPath, ["ls-files", "--", pluginPathspec])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const untrackedLayoutFiles = layoutFiles.filter(
    (file) => !tracked.has(`${pluginPathspec}/${file}`),
  );
  if (status.trim() === "" && untrackedLayoutFiles.length === 0) {
    log(
      `  ${validated.name}@${validated.version} is already up to date; no commit created`,
    );
    return {
      plugin: validated.name,
      version: validated.version,
      repo: repoPath,
      branch,
      dryRun: false,
      changed: false,
      commit: null,
      pushed: false,
    };
  }

  git(repoPath, ["add", "--force", "--", pluginPathspec]);
  git(repoPath, ["add", "--", "marketplace.json"]);

  const bundlePathspec = `${pluginPathspec}/hooks/entry.mjs`;
  const trackedBundle = git(repoPath, [
    "ls-files",
    "--",
    bundlePathspec,
  ]).trim();
  assert(
    trackedBundle !== "",
    `${bundlePathspec} is not tracked after staging. The sync must track the bundled entry in the catalog.`,
  );
  try {
    git(repoPath, ["commit", "-m", commitMessage]);
  } catch (error) {
    throw new Error(
      `git commit failed. Configure an identity in ${repoPath} (git config user.name / user.email) and rerun.`,
      { cause: error },
    );
  }
  const commit = git(repoPath, ["rev-parse", "--short", "HEAD"]).trim();

  if (push) {
    try {
      execFileSync("git", ["push", "origin", branch], {
        cwd: repoPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr).trim().split("\n").slice(-2).join(" ")
          : "";
      throw new Error(
        `git push origin ${branch} failed${stderr ? `: ${stderr}` : ""}. Check remote access: run 'gh auth status', verify the origin URL, or confirm CATALOG_SYNC_PAT has Contents write on the fork. The sync commit is already on ${branch}.`,
        { cause: error },
      );
    }
  }

  log(
    `  committed ${commit}: ${commitMessage}${push ? ` and pushed to origin ${branch}` : ""}`,
  );

  return {
    plugin: validated.name,
    version: validated.version,
    repo: repoPath,
    branch,
    dryRun: false,
    changed: true,
    commit,
    pushed: push,
  };
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0) {
    const value = args[index + 1];
    assert(value && !value.startsWith("--"), `${name} requires a value`);
    return value;
  }
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const result = await syncCatalog({
    repo: optionValue(args, "--repo", undefined),
    branch: optionValue(args, "--branch", defaultBranch),
    layoutRoot: optionValue(args, "--layout", defaultLayoutRoot),
    dryRun: args.includes("--dry-run"),
    push: args.includes("--push"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`sync-catalog failed: ${reason}\n`);
    process.exitCode = 1;
  }
}

export { syncCatalog };
