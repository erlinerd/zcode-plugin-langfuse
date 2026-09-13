import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultLayoutRoot = resolve(root, "dist");
const maxPluginFiles = 5000;
const maxPluginBytes = 256 * 1024 * 1024;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const kebabPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const expectedHookEvents = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
];
const runtimeEntryRelative = "hooks/entry.mjs";

// Required inside the plugin directory (official template layout).
const requiredFiles = [
  ".zcode-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  "hooks/hooks.json",
  runtimeEntryRelative,
  "README.md",
  "README_CN.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function isStrictChild(parent, child) {
  const childRelative = relative(parent, child);
  return (
    childRelative !== "" &&
    childRelative !== ".." &&
    !childRelative.startsWith(`..${sep}`) &&
    !isAbsolute(childRelative)
  );
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label}: ${reason}`, { cause: error });
  }
}

async function ensureRegularFile(filePath, label) {
  const stats = await lstat(filePath).catch((error) => {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Missing ${label}: ${reason}`, { cause: error });
  });
  assert(!stats.isSymbolicLink(), `${label} cannot be a symlink`);
  assert(stats.isFile(), `${label} must be a regular file`);
}

async function validateTree(rootPath) {
  let files = 0;
  let bytes = 0;
  const pending = [rootPath];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = resolve(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Plugin layout contains a symlink: ${relative(rootPath, entryPath)}`,
        );
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files += 1;
        const { size } = await lstat(entryPath);
        bytes += size;
      }
    }
  }

  assert(
    files <= maxPluginFiles,
    `Plugin layout contains ${files} files; limit is ${maxPluginFiles}`,
  );
  assert(
    bytes <= maxPluginBytes,
    `Plugin layout contains ${bytes} bytes; limit is ${maxPluginBytes}`,
  );
}

/**
 * Validates the generated marketplace shell in dist/: a marketplace.json whose
 * single entry points at `./plugins/<name>`, where the plugin directory follows
 * the official ZCode template layout (.zcode-plugin/, .claude-plugin/, hooks/
 * with the sealed bundle at hooks/entry.mjs, and metadata files).
 */
export async function validatePluginRoot(layoutRoot = defaultLayoutRoot) {
  const resolved = resolve(layoutRoot);
  const marketplace = await readJson(
    resolve(resolved, "marketplace.json"),
    "marketplace manifest",
  );
  assert(
    Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1,
    "marketplace manifest must declare exactly one plugin entry",
  );
  const entry = marketplace.plugins[0];
  assert(
    typeof entry.name === "string" && kebabPattern.test(entry.name),
    "marketplace entry name must be kebab-case",
  );
  const expectedSource = `./plugins/${entry.name}`;
  assert(
    entry.source === expectedSource,
    `marketplace entry source must be ${expectedSource}`,
  );
  const pluginRoot = resolve(resolved, "plugins", entry.name);
  assert(
    isStrictChild(resolved, pluginRoot),
    "plugin directory must stay inside the marketplace shell",
  );

  const manifest = await readJson(
    resolve(pluginRoot, ".zcode-plugin/plugin.json"),
    "plugin manifest",
  );
  const claudeManifest = await readJson(
    resolve(pluginRoot, ".claude-plugin/plugin.json"),
    "claude-compatible manifest",
  );

  assert(
    kebabPattern.test(manifest.name),
    "plugin manifest name must be kebab-case",
  );
  assert(
    typeof manifest.version === "string" &&
      semverPattern.test(manifest.version),
    "plugin manifest version must be semver",
  );
  assert(
    typeof manifest.description === "string" && manifest.description.trim(),
    "plugin manifest description is required",
  );
  assert(
    Array.isArray(manifest.keywords) &&
      manifest.keywords.every((tag) => typeof tag === "string"),
    "plugin manifest keywords must be an array of strings",
  );
  assert(
    manifest.name === entry.name && manifest.version === entry.version,
    "marketplace entry and plugin manifest identities differ",
  );
  assert(
    JSON.stringify(claudeManifest) === JSON.stringify(manifest),
    "claude-compatible manifest differs from the plugin manifest",
  );

  const hooks = await readJson(
    resolve(pluginRoot, "hooks/hooks.json"),
    "plugin hooks",
  );
  assert(
    JSON.stringify(Object.keys(hooks.hooks ?? {})) ===
      JSON.stringify(expectedHookEvents),
    "hooks contain an unexpected or incomplete Hook event set",
  );
  const expectedEntryArg = `\${ZCODE_PLUGIN_ROOT}/${runtimeEntryRelative}`;
  for (const event of expectedHookEvents) {
    const groups = hooks.hooks[event];
    assert(
      Array.isArray(groups) && groups.length > 0,
      `${event} must declare a process hook`,
    );
    const processHook = groups[0]?.hooks?.[0];
    assert(processHook?.type === "process", `${event} must use a process hook`);
    assert(
      processHook.args?.includes(expectedEntryArg),
      `${event} must invoke the bundled entry`,
    );
  }

  for (const relativePath of requiredFiles) {
    await ensureRegularFile(resolve(pluginRoot, relativePath), relativePath);
  }
  const runtimeEntry = await readFile(
    resolve(pluginRoot, runtimeEntryRelative),
    "utf8",
  );
  assert(
    runtimeEntry.includes("Generated by npm run build"),
    "bundled entry is not a current build output",
  );

  await validateTree(resolved);

  return {
    name: manifest.name,
    version: manifest.version,
    layoutRoot: resolved,
    pluginRoot,
    runtimeEntry: resolve(pluginRoot, runtimeEntryRelative),
  };
}
