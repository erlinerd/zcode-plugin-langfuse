import { describe, expect, it } from "vitest";
import { TurnTracker } from "../src/application/turn-tracker.js";
import type {
  Clock,
  CompletedTurn,
  HookConfig,
  HookPayload,
  IdGenerator,
  SessionState,
  StateStore,
  TraceSink,
} from "../src/domain/types.js";

class MemoryStateStore implements StateStore {
  private readonly values = new Map<string, SessionState>();

  async load(sessionId: string): Promise<SessionState | null> {
    const state = this.values.get(sessionId);
    return state ? structuredClone(state) : null;
  }

  async save(state: SessionState): Promise<void> {
    this.values.set(state.sessionId, structuredClone(state));
  }

  async clear(sessionId: string): Promise<void> {
    this.values.delete(sessionId);
  }

  async withSessionLock<T>(
    _sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    return task();
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

class SequentialIds implements IdGenerator {
  private nextId = 0;

  next(): string {
    this.nextId += 1;
    return `id-${this.nextId}`;
  }
}

class CollectingSink implements TraceSink {
  readonly turns: CompletedTurn[] = [];

  async publishTurn(turn: CompletedTurn): Promise<void> {
    this.turns.push(turn);
  }
}

const config: HookConfig = {
  publicKey: "public-key-test",
  secretKey: "secret-key-test",
  baseUrl: "https://example.test",
  userId: null,
  environment: "test",
  release: "test",
  enabled: true,
  capturePrompts: true,
  captureToolInputs: true,
  captureToolOutputs: true,
  maxCaptureChars: 200,
  debug: false,
};

function payload(
  event: string,
  fields: Record<string, unknown> = {},
): HookPayload {
  return {
    hook_event_name: event,
    session_id: "session-1",
    ...fields,
  };
}

function createTracker(overrides: Partial<HookConfig> = {}): {
  tracker: TurnTracker;
  sink: CollectingSink;
  store: MemoryStateStore;
} {
  const store = new MemoryStateStore();
  const sink = new CollectingSink();
  const tracker = new TurnTracker(
    store,
    sink,
    { ...config, ...overrides },
    new FixedClock(),
    new SequentialIds(),
  );
  return { tracker, sink, store };
}

describe("TurnTracker", () => {
  it("correlates prompts, tools, and assistant output into one completed turn", async () => {
    const { tracker, sink, store } = createTracker();

    await tracker.handle(payload("SessionStart"));
    await tracker.handle(
      payload("UserPromptSubmit", { prompt: "Find the failing test" }),
    );
    await tracker.handle(
      payload("PreToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      }),
    );
    await tracker.handle(
      payload("PostToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_output: { exitCode: 1, stderr: "failed" },
      }),
    );
    await tracker.handle(
      payload("Stop", { last_assistant_message: "The test is failing." }),
    );

    expect(sink.turns).toHaveLength(1);
    expect(sink.turns[0]).toMatchObject({
      sessionId: "session-1",
      prompt: "Find the failing test",
      assistantMessage: "The test is failing.",
      tools: [
        {
          id: "tool-1",
          name: "Bash",
          input: { command: "npm test" },
          output: { exitCode: 1, stderr: "failed" },
          error: null,
        },
      ],
    });
    expect(await store.load("session-1")).toBeNull();
  });

  it("records a failed tool without blocking the stop event", async () => {
    const { tracker, sink } = createTracker();

    await tracker.handle(
      payload("PreToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_input: { command: "false" },
      }),
    );
    await tracker.handle(
      payload("PostToolUseFailure", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        error_message: "exit code 1",
      }),
    );
    await tracker.handle(payload("Stop"));

    expect(sink.turns[0]?.tools[0]).toMatchObject({
      error: "exit code 1",
      output: null,
      endedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("supports metadata-only mode without retaining prompt or tool payloads", async () => {
    const { tracker, sink, store } = createTracker({
      capturePrompts: false,
      captureToolInputs: false,
      captureToolOutputs: false,
    });

    await tracker.handle(
      payload("UserPromptSubmit", { prompt: "private prompt" }),
    );
    await tracker.handle(
      payload("PreToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Read",
        tool_input: { file_path: "/private/file" },
      }),
    );
    await tracker.handle(
      payload("PostToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Read",
        tool_output: { contents: "private output" },
      }),
    );

    const persisted = await store.load("session-1");
    expect(persisted?.currentTurn).toMatchObject({
      prompt: null,
      tools: [{ input: null, output: null, error: null }],
    });

    await tracker.handle(
      payload("Stop", { last_assistant_message: "private response" }),
    );

    expect(sink.turns[0]).toMatchObject({
      prompt: null,
      assistantMessage: null,
      tools: [{ input: null, output: null, error: null }],
    });
  });
});
