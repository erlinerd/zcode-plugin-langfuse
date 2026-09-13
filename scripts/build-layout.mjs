import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPluginRoot = resolve(root, "dist");
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
const runtimeEntryRelative = "payload/dist/hooks/entry.mjs";

const requiredFiles = [
  ".zcode-plugin/plugin.json",
  "hooks/hooks.json",
  runtimeEntryRelative,
  "marketplace.json",
  "package.json",
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

async function validateTree(pluginRoot) {
  let files = 0;
  let bytes = 0;
  const pending = [pluginRoot];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = resolve(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Plugin root contains a symlink: ${relative(pluginRoot, entryPath)}`,
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
    `Plugin root contains ${files} files; limit is ${maxPluginFiles}`,
  );
  assert(
    bytes <= maxPluginBytes,
    `Plugin root contains ${bytes} bytes; limit is ${maxPluginBytes}`,
  );
}

/**
 * Validates an assembled plugin root laid out per the official ZCode plugin
 * structure: `.zcode-plugin/`, `hooks/`, `payload/dist/hooks/entry.mjs`
 * (the sealed bundle, mimosa-style), `marketplace.json`, and metadata files.
 */
export async function validatePluginRoot(pluginRoot = defaultPluginRoot) {
  const resolved = resolve(pluginRoot);
  const manifest = await readJson(
    resolve(resolved, ".zcode-plugin/plugin.json"),
    "plugin manifest",
  );
  const packageJson = await readJson(
    resolve(resolved, "package.json"),
    "plugin package metadata",
  );
  const hooks = await readJson(
    resolve(resolved, "hooks/hooks.json"),
    "plugin hooks",
  );
  const marketplace = await readJson(
    resolve(resolved, "marketplace.json"),
    "marketplace manifest",
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
    manifest.license === packageJson.license,
    "plugin and package licenses differ",
  );
  assert(
    manifest.version === packageJson.version,
    "plugin and package versions differ",
  );
  assert(
    Array.isArray(manifest.keywords) &&
      manifest.keywords.every((tag) => typeof tag === "string"),
    "plugin manifest keywords must be an array of strings",
  );

  assert(
    Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1,
    "marketplace manifest must declare exactly one plugin entry",
  );
  const entry = marketplace.plugins[0];
  assert(
    entry.name === manifest.name && entry.version === manifest.version,
    "marketplace entry and plugin manifest identities differ",
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
      `${event} must invoke the payload bundle entry`,
    );
  }

  for (const relativePath of requiredFiles) {
    await ensureRegularFile(resolve(resolved, relativePath), relativePath);
  }
  const runtimeEntry = await readFile(
    resolve(resolved, runtimeEntryRelative),
    "utf8",
  );
  assert(
    runtimeEntry.includes("Generated by npm run build"),
    "payload entry is not a current build output",
  );

  await validateTree(resolved);

  return {
    name: manifest.name,
    version: manifest.version,
    pluginRoot: resolved,
    runtimeEntry: resolve(resolved, runtimeEntryRelative),
  };
}
