import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type {
  JsonValue,
  SessionState,
  StateStore,
  ToolCall,
  TurnState,
} from "../domain/types.js";

const LOCK_WAIT_MS = 25;
const LOCK_ATTEMPTS = 160;
const STALE_LOCK_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function parseToolCall(value: unknown): ToolCall | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isJsonValue(value.input) ||
    (value.output !== null && !isJsonValue(value.output)) ||
    (value.error !== null && typeof value.error !== "string") ||
    typeof value.startedAt !== "string" ||
    (value.endedAt !== null && typeof value.endedAt !== "string")
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    input: value.input,
    output: value.output,
    error: value.error,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
  };
}

function parseTurn(value: unknown): TurnState | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    (value.prompt !== null && typeof value.prompt !== "string") ||
    typeof value.startedAt !== "string" ||
    !Array.isArray(value.tools)
  ) {
    return null;
  }
  const tools = value.tools.map(parseToolCall);
  if (tools.some((tool): tool is null => tool === null)) return null;
  return {
    id: value.id,
    prompt: value.prompt,
    startedAt: value.startedAt,
    tools: tools.filter((tool): tool is ToolCall => tool !== null),
  };
}

function parseState(value: unknown): SessionState | null {
  if (!isRecord(value)) return null;
  if (
    value.version !== 1 ||
    typeof value.sessionId !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const currentTurn =
    value.currentTurn === null ? null : parseTurn(value.currentTurn);
  if (value.currentTurn !== null && currentTurn === null) return null;
  return {
    version: 1,
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    currentTurn,
  };
}

function sessionKey(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

function defaultDataDir(): string {
  return join(
    homedir() || tmpdir(),
    ".zcode",
    "cli",
    "plugins",
    "data",
    "langfuse-observability",
  );
}

export class JsonStateStore implements StateStore {
  private readonly dataDir: string;

  constructor(dataDir = process.env.ZCODE_PLUGIN_DATA || defaultDataDir()) {
    this.dataDir = dataDir;
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const contents = await readFile(this.statePath(sessionId), "utf8");
      return parseState(JSON.parse(contents));
    } catch {
      return null;
    }
  }

  async save(state: SessionState): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const path = this.statePath(state.sessionId);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  }

  async clear(sessionId: string): Promise<void> {
    await rm(this.statePath(sessionId), { force: true });
  }

  async withSessionLock<T>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const lockPath = this.lockPath(sessionId);
    let acquired = false;

    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        await handle.close();
        acquired = true;
        break;
      } catch {
        await this.removeStaleLock(lockPath);
        await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
      }
    }

    if (!acquired)
      throw new Error("Timed out acquiring the Langfuse state lock");

    try {
      return await task();
    } finally {
      await rm(lockPath, { force: true });
    }
  }

  private statePath(sessionId: string): string {
    return join(this.dataDir, `${sessionKey(sessionId)}.json`);
  }

  private lockPath(sessionId: string): string {
    return join(this.dataDir, `${sessionKey(sessionId)}.lock`);
  }

  private async removeStaleLock(lockPath: string): Promise<void> {
    try {
      const details = await stat(lockPath);
      if (Date.now() - details.mtimeMs > STALE_LOCK_MS)
        await rm(lockPath, { force: true });
    } catch {
      // The lock may disappear between open(), stat(), and rm().
    }
  }
}
