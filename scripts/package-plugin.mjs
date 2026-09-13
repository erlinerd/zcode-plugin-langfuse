import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assemblePluginLayout } from "./build-layout.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = resolve(root, "artifacts");
const stagingDir = resolve(artifactDir, ".staging");
const pluginManifestPath = resolve(root, ".zcode-plugin/plugin.json");
let pluginManifest;
try {
  pluginManifest = JSON.parse(await readFile(pluginManifestPath, "utf8"));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(`Unable to read plugin manifest: ${reason}`, {
    cause: error,
  });
}
const pluginName = pluginManifest.name;
const archiveName = `${pluginName}-v${pluginManifest.version}.zip`;
const archivePath = resolve(artifactDir, archiveName);
const checksumPath = resolve(artifactDir, `${archiveName}.sha256`);
const packageRoot = resolve(stagingDir, pluginName);

if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pluginName)) {
  throw new Error(
    `Plugin name cannot be used as an archive directory: ${pluginName}`,
  );
}

const packageFiles = [
  ".zcode-plugin/plugin.json",
  "hooks/hooks.json",
  "dist/hooks/entry.mjs",
  "marketplace.json",
  "THIRD_PARTY_NOTICES.md",
];

await rm(stagingDir, { recursive: true, force: true });
await rm(archivePath, { force: true });
await rm(checksumPath, { force: true });
await mkdir(packageRoot, { recursive: true });

for (const relativePath of packageFiles) {
  const source = resolve(root, relativePath);
  const destination = resolve(packageRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

try {
  execFileSync("zip", ["-X", "-q", "-r", archivePath, pluginName], {
    cwd: stagingDir,
    stdio: "inherit",
  });
} catch (error) {
  throw new Error(
    "Unable to create the plugin archive. Install the zip command before packaging.",
    { cause: error },
  );
}

const checksum = createHash("sha256")
  .update(await readFile(archivePath))
  .digest("hex");
await writeFile(checksumPath, `${checksum}  ${archiveName}\n`);
await rm(stagingDir, { recursive: true, force: true });

const pluginLayout = await assemblePluginLayout({
  sourceRoot: root,
  outputRoot: resolve(artifactDir, "plugin-layout"),
});

process.stdout.write(
  `${JSON.stringify({
    plugin: pluginName,
    version: pluginManifest.version,
    archive: `artifacts/${archiveName}`,
    sha256: checksum,
    marketplacePath: pluginName,
    layout: relative(root, pluginLayout.outputRoot),
  })}\n`,
);
