import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let root;
try {
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(`Unable to resolve the repository root: ${reason}`);
}

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read valid JSON from ${relativePath}: ${error.message}`,
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
}

function normalizedJson(value) {
  return JSON.stringify(canonicalize(value));
}

const artifactMode = process.argv.includes("--artifact");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const plugin = readJson(".zcode-plugin/plugin.json");
const marketplace = readJson("marketplace.json");
const hooks = readJson("hooks/hooks.json");
const builtPlugin = artifactMode ? readJson("dist/plugin.json") : null;
const builtHooks = artifactMode ? readJson("dist/hooks/hooks.json") : null;

assert(packageJson.private === true, "package.json must remain private");
assert(
  packageJson.license === "MIT",
  "package.json must declare the MIT license",
);
assert(
  packageLock.version === packageJson.version,
  "package-lock and package versions differ",
);
assert(
  packageLock.packages?.[""].version === packageJson.version,
  "package-lock root package version differs",
);
assert(
  plugin.license === packageJson.license,
  "plugin and package licenses differ",
);
assert(
  plugin.version === packageJson.version,
  "plugin and package versions differ",
);
if (artifactMode) {
  assert(builtPlugin.version === plugin.version, "dist/plugin.json is stale");
  assert(
    builtPlugin.name === plugin.name,
    "dist/plugin.json has the wrong plugin name",
  );
  assert(
    normalizedJson(hooks) === normalizedJson(builtHooks),
    "dist/hooks/hooks.json is stale; run npm run build",
  );
}

assert(
  marketplace.plugins?.length === 1,
  "marketplace.json must declare exactly one plugin entry",
);
assert(
  marketplace.plugins[0].name === plugin.name,
  "marketplace and plugin names differ",
);
assert(
  marketplace.plugins[0].version === plugin.version,
  "marketplace and plugin versions differ",
);
const expectedHookEvents = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
];
assert(
  JSON.stringify(Object.keys(hooks.hooks ?? {})) ===
    JSON.stringify(expectedHookEvents),
  "hooks/hooks.json contains an unexpected or incomplete Hook event set",
);

if (artifactMode) {
  for (const relativePath of [
    "dist/hooks/entry.mjs",
    "dist/hooks/entry.mjs.map",
    "dist/hooks/hooks.json",
    "dist/plugin.json",
  ]) {
    assert(
      fs.existsSync(path.join(root, relativePath)),
      `Missing build artifact: ${relativePath}`,
    );
  }
}

const textFiles = [
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "DESIGN.md",
  "SECURITY.md",
  "AGENTS.md",
  ".zcode-plugin/plugin.json",
  "marketplace.json",
];
if (artifactMode) {
  textFiles.push("dist/plugin.json", "dist/hooks/entry.mjs");
}
const credentialPattern = /(?:pk|sk)-lf-[A-Za-z0-9_-]{12,}/;
for (const relativePath of textFiles) {
  const contents = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert(
    !credentialPattern.test(contents),
    `Possible Langfuse credential found in ${relativePath}`,
  );
}

process.stdout.write(
  `Validated ${plugin.name}@${plugin.version}: manifests, Hook events, ${artifactMode ? "build artifacts, " : ""}and credential hygiene.\n`,
);
