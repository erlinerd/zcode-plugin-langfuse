import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLUGIN_ID } from "../src/domain/identity.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("plugin identity", () => {
  it("matches the plugin name in the packaged plugin manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, ".zcode-plugin/plugin.json"), "utf8"),
    ) as { name: string };
    expect(PLUGIN_ID).toBe(manifest.name);
  });

  it("matches the first plugin entry in the marketplace manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string }> };
    expect(PLUGIN_ID).toBe(manifest.plugins[0]?.name);
  });
});
