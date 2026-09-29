import {
  assistantMessage,
  eventName,
  prompt,
  sessionId,
  toolError,
  toolId,
  toolInput,
  toolName,
  toolOutput,
} from "../domain/extract.js";
import {
  boundStringWithMedia,
  boundValuePreservingMedia,
  containsMedia,
  truncateText,
} from "../domain/media.js";
import type {
  Clock,
  CompletedTurn,
  HookConfig,
  HookPayload,
  IdGenerator,
  JsonValue,
  SessionState,
  StateStore,
  ToolCall,
  TraceSink,
  TurnState,
} from "../domain/types.js";

function createSession(session: string, now: string): SessionState {
  return {
    version: 1,
    sessionId: session,
    startedAt: now,
    updatedAt: now,
    currentTurn: null,
  };
}

function createTurn(
  id: string,
  now: string,
  userPrompt: string | null,
): TurnState {
  return {
    id,
    prompt: userPrompt,
    startedAt: now,
    tools: [],
  };
}

// Payload bounds live in src/domain/media.ts: text truncates at
// maxCaptureChars, whole data-URI media survives up to maxMediaChars.

function boundValue(
  value: JsonValue,
  config: HookConfig,
): JsonValue {
  return boundValuePreservingMedia(
    value,
    config.maxCaptureChars,
    config.maxMediaChars,
  );
}

function sanitizeTurn(turn: CompletedTurn, config: HookConfig): CompletedTurn {
  const sanitized: CompletedTurn = {
    ...turn,
    prompt:
      config.capturePrompts && turn.prompt !== null
        ? boundStringWithMedia(
            turn.prompt,
            config.maxCaptureChars,
            config.maxMediaChars,
          )
        : null,
    assistantMessage:
      config.capturePrompts && turn.assistantMessage !== null
        ? boundStringWithMedia(
            turn.assistantMessage,
            config.maxCaptureChars,
            config.maxMediaChars,
          )
        : null,
    tools: turn.tools.map((tool) => ({
      ...tool,
      name: truncateText(tool.name, 256),
      input: config.captureToolInputs
        ? boundValue(tool.input, config)
        : null,
      output:
        config.captureToolOutputs && tool.output !== null
          ? boundValue(tool.output, config)
          : null,
      error:
        config.captureToolOutputs && tool.error !== null
          ? truncateText(tool.error, config.maxCaptureChars)
          : null,
    })),
  };
  sanitized.hasMedia =
    config.maxMediaChars > 0 &&
    containsMedia({
      prompt: sanitized.prompt,
      assistantMessage: sanitized.assistantMessage,
      tools: sanitized.tools.map((tool) => ({
        input: tool.input,
        output: tool.output,
      })),
    });
  return sanitized;
}

function findTool(
  turn: TurnState,
  id: string | null,
  name: string,
): ToolCall | null {
  if (id) {
    const byId = turn.tools.find((tool) => tool.id === id);
    if (byId) return byId;
  }
  return (
    [...turn.tools]
      .reverse()
      .find((tool) => tool.endedAt === null && tool.name === name) ??
    [...turn.tools].reverse().find((tool) => tool.endedAt === null) ??
    null
  );
}

export class TurnTracker {
  constructor(
    private readonly stateStore: StateStore,
    private readonly traceSink: TraceSink,
    private readonly config: HookConfig,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async handle(payload: HookPayload): Promise<void> {
    const name = eventName(payload);
    const session = sessionId(payload);
    if (!name || !session) return;

    let completed: CompletedTurn | null = null;
    await this.stateStore.withSessionLock(session, async () => {
      const now = this.clock.now().toISOString();
      const existing =
        (await this.stateStore.load(session)) ?? createSession(session, now);

      switch (name) {
        case "SessionStart":
          existing.updatedAt = now;
          await this.stateStore.save(existing);
          return;
        case "UserPromptSubmit": {
          const userPrompt = prompt(payload);
          existing.currentTurn = createTurn(
            this.idGenerator.next(),
            now,
            this.config.capturePrompts && userPrompt !== null
              ? boundStringWithMedia(
                  userPrompt,
                  this.config.maxCaptureChars,
                  this.config.maxMediaChars,
                )
              : null,
          );
          existing.updatedAt = now;
          await this.stateStore.save(existing);
          return;
        }
        case "PreToolUse":
          this.recordToolStart(existing, payload, now);
          await this.stateStore.save(existing);
          return;
        case "PostToolUse":
          this.recordToolOutput(existing, payload, now, false);
          await this.stateStore.save(existing);
          return;
        case "PostToolUseFailure":
          this.recordToolOutput(existing, payload, now, true);
          await this.stateStore.save(existing);
          return;
        case "Stop":
          completed = sanitizeTurn(
            {
              sessionId: session,
              turnId: existing.currentTurn?.id ?? this.idGenerator.next(),
              prompt: existing.currentTurn?.prompt ?? null,
              assistantMessage: assistantMessage(payload),
              startedAt: existing.currentTurn?.startedAt ?? now,
              endedAt: now,
              tools: existing.currentTurn?.tools ?? [],
              hasMedia: false,
            },
            this.config,
          );
          await this.stateStore.clear(session);
          return;
        default:
          return;
      }
    });

    if (completed) await this.traceSink.publishTurn(completed);
  }

  private recordToolStart(
    state: SessionState,
    payload: HookPayload,
    now: string,
  ): void {
    const turn =
      state.currentTurn ?? createTurn(this.idGenerator.next(), now, null);
    state.currentTurn = turn;
    turn.tools.push({
      id: toolId(payload) ?? this.idGenerator.next(),
      name: toolName(payload),
      input: this.config.captureToolInputs
        ? boundValue(toolInput(payload), this.config)
        : null,
      output: null,
      error: null,
      startedAt: now,
      endedAt: null,
    });
    state.updatedAt = now;
  }

  private recordToolOutput(
    state: SessionState,
    payload: HookPayload,
    now: string,
    failed: boolean,
  ): void {
    const turn =
      state.currentTurn ?? createTurn(this.idGenerator.next(), now, null);
    state.currentTurn = turn;
    const name = toolName(payload);
    const tool = findTool(turn, toolId(payload), name);
    const output =
      !failed && this.config.captureToolOutputs
        ? boundValue(toolOutput(payload), this.config)
        : null;
    const error =
      failed && this.config.captureToolOutputs
        ? truncateText(toolError(payload), this.config.maxCaptureChars)
        : null;
    if (tool) {
      tool.output = output;
      tool.error = error;
      tool.endedAt = now;
    } else {
      turn.tools.push({
        id: toolId(payload) ?? this.idGenerator.next(),
        name,
        input: null,
        output,
        error,
        startedAt: now,
        endedAt: now,
      });
    }
    state.updatedAt = now;
  }
}

export class NoopTraceSink implements TraceSink {
  async publishTurn(_turn: CompletedTurn): Promise<void> {
    // Missing credentials must never make ZCode hooks fail.
  }
}
