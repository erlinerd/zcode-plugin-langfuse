import { randomUUID } from "node:crypto";
import { readConfig, isConfigured } from "../application/config.js";
import { NoopTraceSink, TurnTracker } from "../application/turn-tracker.js";
import { JsonStateStore } from "../adapters/json-state-store.js";
import { LangfuseTraceSink } from "../adapters/langfuse-sink.js";
import { eventName, sessionId } from "../domain/extract.js";
import type { Clock, HookPayload, IdGenerator } from "../domain/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(raw: string): HookPayload {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as HookPayload) : {};
  } catch {
    return {};
  }
}

async function readStdin(): Promise<string> {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

function diagnostics(enabled: boolean, message: string): void {
  if (enabled) process.stderr.write(`[zcode-plugin-langfuse] ${message}\n`);
}

async function main(): Promise<void> {
  const config = readConfig();
  const payload = parsePayload(await readStdin());
  const event = eventName(payload) ?? "unknown";
  const session = sessionId(payload) ?? "?";

  diagnostics(config.debug, `event=${event} session=${session}`);

  const sink = isConfigured(config)
    ? new LangfuseTraceSink(config)
    : new NoopTraceSink();
  const tracker = new TurnTracker(
    new JsonStateStore(),
    sink,
    config,
    { now: () => new Date() } satisfies Clock,
    { next: randomUUID } satisfies IdGenerator,
  );

  try {
    await tracker.handle(payload);
  } catch (error) {
    const kind = error instanceof Error ? error.name : "unknown";
    diagnostics(config.debug, `hook failed open (${kind})`);
  }

  // Hooks must always emit one JSON object. Observability has no context to add.
  process.stdout.write("{}\n");
}

await main();
