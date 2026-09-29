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
  maxMediaChars: 10_000,
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

  it("never exceeds the configured capture limit", async () => {
    const { tracker, sink } = createTracker({ maxCaptureChars: 1 });

    await tracker.handle(payload("UserPromptSubmit", { prompt: "private" }));
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
        tool_output: { stdout: "private output" },
      }),
    );
    await tracker.handle(
      payload("Stop", { last_assistant_message: "private response" }),
    );

    const turn = sink.turns[0];
    expect(turn?.prompt?.length).toBeLessThanOrEqual(1);
    expect(turn?.assistantMessage?.length).toBeLessThanOrEqual(1);
    expect(turn?.tools[0]?.input).toHaveLength(1);
    expect(turn?.tools[0]?.output).toHaveLength(1);
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

  it("preserves whole data-URI media past the text budget and flags hasMedia", async () => {
    const { tracker, sink } = createTracker({ maxCaptureChars: 100 });
    const uri = `data:image/png;base64,${"A".repeat(500)}`;

    await tracker.handle(payload("UserPromptSubmit", { prompt: "look" }));
    await tracker.handle(
      payload("PreToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_input: { command: "screenshot" },
      }),
    );
    await tracker.handle(
      payload("PostToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_output: {
          content: [{ type: "image", data: "A".repeat(500), mimeType: "image/png" }],
        },
      }),
    );
    await tracker.handle(
      payload("Stop", { last_assistant_message: "done" }),
    );

    const turn = sink.turns[0];
    const serialized = JSON.stringify(turn?.tools[0]?.output);
    expect(serialized).toContain(uri);
    expect(turn?.hasMedia).toBe(true);
  });

  it("replaces over-budget media with an omission marker and drops hasMedia", async () => {
    const { tracker, sink } = createTracker({ maxMediaChars: 100 });
    const uri = `data:image/png;base64,${"A".repeat(500)}`;

    await tracker.handle(payload("UserPromptSubmit", { prompt: "look" }));
    await tracker.handle(
      payload("PostToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_output: { img: "A".repeat(500) },
      }),
    );
    await tracker.handle(
      payload("Stop", { last_assistant_message: "done" }),
    );

    const turn = sink.turns[0];
    const serialized = JSON.stringify(turn?.tools[0]?.output);
    expect(serialized).not.toContain(uri);
    expect(serialized).toContain("[media image/png ~0KB omitted]");
    expect(turn?.hasMedia).toBe(false);
  });

  it("keeps no media when media preservation is disabled", async () => {
    const { tracker, sink } = createTracker({ maxMediaChars: 0 });
    const uri = `data:image/png;base64,${"A".repeat(500)}`;

    await tracker.handle(payload("UserPromptSubmit", { prompt: "look" }));
    await tracker.handle(
      payload("PostToolUse", {
        tool_use_id: "tool-1",
        tool_name: "Bash",
        tool_output: { output: uri },
      }),
    );
    await tracker.handle(
      payload("Stop", { last_assistant_message: "done" }),
    );

    const turn = sink.turns[0];
    expect(JSON.stringify(turn?.tools[0]?.output)).not.toContain(uri);
    expect(turn?.hasMedia).toBe(false);
  });
});
