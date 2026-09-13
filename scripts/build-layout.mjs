import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputRoot = resolve(root, "dist");
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

// Static files copied from the checkout into the plugin directory. The
// runtime entry is NOT in this list: esbuild emits it into
// plugins/<name>/dist/hooks/entry.mjs after assembly.
const pluginFiles = [
  [".zcode-plugin/plugin.json", ".zcode-plugin/plugin.json"],
  ["hooks/hooks.json", "hooks/hooks.json"],
  ["README.md", "README.md"],
  ["README.zh-CN.md", "README_CN.md"],
  ["LICENSE", "LICENSE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["package.json", "package.json"],
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

async function copyRegularFile(sourceRoot, outputRoot, [source, target]) {
  const sourcePath = resolve(sourceRoot, source);
  const targetPath = resolve(outputRoot, target);
  await ensureRegularFile(sourcePath, source);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath);
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function marketplaceEntry(manifest) {
  return {
    name: manifest.name,
    source: `./plugins/${manifest.name}`,
    description: manifest.description,
    version: manifest.version,
    category: "developer-tools",
    tags: manifest.keywords,
    strict: true,
    description_i18n: manifest.description_i18n,
  };
}

function marketplaceFixture(entry) {
  return {
    name: "zcode-plugins",
    description:
      "ZCode plugins marketplace: built-in and community plugins for ZCode.",
    description_i18n: {
      en: "ZCode plugins marketplace: built-in and community plugins for ZCode.",
      "zh-CN": "ZCode 插件市场：内置插件与社区插件。",
    },
    owner: {
      name: "Z.ai",
      url: "https://z.ai",
    },
    plugins: [entry],
  };
}

async function validateManifest(manifest, packageJson) {
  assert(typeof manifest.name === "string", "plugin manifest name is required");
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
    manifest.description_i18n &&
      typeof manifest.description_i18n.en === "string" &&
      typeof manifest.description_i18n["zh-CN"] === "string",
    "plugin manifest must contain English and Simplified Chinese descriptions",
  );
  assert(
    Array.isArray(manifest.keywords) &&
      manifest.keywords.every((tag) => typeof tag === "string"),
    "plugin manifest keywords must be an array of strings",
  );
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
          `Plugin layout contains a symlink: ${relative(pluginRoot, entryPath)}`,
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

async function validateHooks(hooks, pluginRoot) {
  assert(
    JSON.stringify(Object.keys(hooks.hooks ?? {})) ===
      JSON.stringify(expectedHookEvents),
    "plugin layout hooks contain an unexpected or incomplete Hook event set",
  );

  const expectedEntry = "${ZCODE_PLUGIN_ROOT}/dist/hooks/entry.mjs";
  for (const event of expectedHookEvents) {
    const groups = hooks.hooks[event];
    assert(
      Array.isArray(groups) && groups.length > 0,
      `${event} must declare a process hook`,
    );
    const processHook = groups[0]?.hooks?.[0];
    assert(processHook?.type === "process", `${event} must use a process hook`);
    assert(
      processHook.args?.includes(expectedEntry),
      `${event} must invoke the bundled plugin entry`,
    );
  }

  const entryPath = resolve(pluginRoot, "dist/hooks/entry.mjs");
  const entry = await readFile(entryPath, "utf8");
  assert(
    entry.includes("Generated by npm run build"),
    "plugin entry is not a current build output",
  );
}

export async function validatePluginLayout({
  outputRoot = defaultOutputRoot,
} = {}) {
  const marketplacePath = resolve(outputRoot, "marketplace.json");
  const marketplace = await readJson(marketplacePath, "marketplace manifest");

  assert(
    Array.isArray(marketplace.plugins),
    "marketplace manifest must declare a plugins array",
  );
  assert(
    marketplace.plugins.length === 1,
    "marketplace manifest must declare exactly one plugin entry",
  );
  const entry = marketplace.plugins[0];
  assert(
    entry.source === `./plugins/${entry.name}`,
    "marketplace entry source must be ./plugins/<name>",
  );
  assert(
    entry.category === "developer-tools",
    "marketplace entry category must be developer-tools",
  );

  const pluginRoot = resolve(outputRoot, "plugins", entry.name);
  const manifest = await readJson(
    resolve(pluginRoot, ".zcode-plugin/plugin.json"),
    "plugin layout manifest",
  );
  const packageJson = await readJson(
    resolve(pluginRoot, "package.json"),
    "plugin layout package metadata",
  );
  const hooks = await readJson(
    resolve(pluginRoot, "hooks/hooks.json"),
    "plugin layout hooks",
  );

  assert(
    manifest.name === entry.name,
    "plugin layout manifest and marketplace names differ",
  );
  assert(
    manifest.version === entry.version,
    "plugin layout manifest and marketplace versions differ",
  );
  assert(
    JSON.stringify(manifest.description_i18n) ===
      JSON.stringify(entry.description_i18n),
    "plugin layout manifest and marketplace descriptions differ",
  );
  assert(
    packageJson.name === manifest.name,
    "plugin layout package and manifest names differ",
  );
  assert(
    packageJson.version === manifest.version,
    "plugin layout package and manifest versions differ",
  );

  for (const [, target] of pluginFiles) {
    await ensureRegularFile(
      resolve(pluginRoot, target),
      `plugin layout ${target}`,
    );
  }
  await validateHooks(hooks, pluginRoot);
  await validateTree(pluginRoot);

  return {
    name: manifest.name,
    version: manifest.version,
    outputRoot,
    pluginRoot,
    marketplacePath,
  };
}

export async function assemblePluginLayout({
  sourceRoot = root,
  outputRoot = defaultOutputRoot,
} = {}) {
  const resolvedSourceRoot = resolve(sourceRoot);
  const resolvedOutputRoot = resolve(outputRoot);
  assert(
    resolvedOutputRoot === resolve(resolvedSourceRoot, "dist"),
    "plugin layout output must be the dist directory of the source repository",
  );

  const manifest = await readJson(
    resolve(resolvedSourceRoot, ".zcode-plugin/plugin.json"),
    "plugin manifest",
  );
  const packageJson = await readJson(
    resolve(resolvedSourceRoot, "package.json"),
    "package metadata",
  );
  await validateManifest(manifest, packageJson);

  const pluginLayoutRoot = resolve(
    resolvedOutputRoot,
    "plugins",
    manifest.name,
  );
  await rm(resolvedOutputRoot, { recursive: true, force: true });
  await mkdir(pluginLayoutRoot, { recursive: true });

  for (const file of pluginFiles) {
    await copyRegularFile(resolvedSourceRoot, pluginLayoutRoot, file);
  }

  const entry = marketplaceEntry(manifest);
  await writeJson(
    resolve(resolvedOutputRoot, "marketplace.json"),
    marketplaceFixture(entry),
  );

  return {
    name: manifest.name,
    version: manifest.version,
    outputRoot: resolvedOutputRoot,
    pluginRoot: pluginLayoutRoot,
    entry,
  };
}
