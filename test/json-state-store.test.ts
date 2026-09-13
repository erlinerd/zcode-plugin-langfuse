import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStateStore } from "../src/adapters/json-state-store.js";
import type { SessionState } from "../src/domain/types.js";

function state(): SessionState {
  return {
    version: 1,
    sessionId: "session-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
    currentTurn: {
      id: "turn-1",
      prompt: "hello",
      startedAt: "2026-01-01T00:00:00.000Z",
      tools: [],
    },
  };
}

describe("JsonStateStore", () => {
  it("persists and clears session state without exposing the raw session id in the filename", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zcode-plugin-langfuse-state-"));
    try {
      const store = new JsonStateStore(directory);
      await store.save(state());

      const restored = await store.load("session-1");
      expect(restored).toEqual(state());

      await store.clear("session-1");
      expect(await store.load("session-1")).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("serializes updates through the per-session lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zcode-plugin-langfuse-lock-"));
    try {
      const store = new JsonStateStore(directory);
      let active = 0;
      let overlapped = false;
      const run = (delayMs: number) =>
        store.withSessionLock("session-1", async () => {
          active += 1;
          overlapped ||= active > 1;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          active -= 1;
        });

      await Promise.all([run(20), run(0)]);
      expect(overlapped).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
