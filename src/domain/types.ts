export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Stop"
  | (string & {});

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HookPayload = Record<string, unknown> & {
  hook_event_name?: unknown;
  hookEventName?: unknown;
  event?: unknown;
  session_id?: unknown;
  sessionId?: unknown;
  prompt?: unknown;
  user_prompt?: unknown;
  userPrompt?: unknown;
  last_assistant_message?: unknown;
  lastAssistantMessage?: unknown;
  tool_name?: unknown;
  toolName?: unknown;
  tool_use_id?: unknown;
  toolUseId?: unknown;
  tool_input?: unknown;
  toolInput?: unknown;
  tool_output?: unknown;
  toolOutput?: unknown;
  error?: unknown;
  error_message?: unknown;
  errorMessage?: unknown;
};

export interface ToolCall {
  id: string;
  name: string;
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TurnState {
  id: string;
  prompt: string | null;
  startedAt: string;
  tools: ToolCall[];
}

export interface SessionState {
  version: 1;
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  currentTurn: TurnState | null;
}

export interface CompletedTurn {
  sessionId: string;
  turnId: string;
  prompt: string | null;
  assistantMessage: string | null;
  startedAt: string;
  endedAt: string;
  tools: ToolCall[];
}

export interface HookConfig {
  publicKey: string | null;
  secretKey: string | null;
  baseUrl: string;
  userId: string | null;
  environment: string;
  release: string;
  enabled: boolean;
  capturePrompts: boolean;
  captureToolInputs: boolean;
  captureToolOutputs: boolean;
  maxCaptureChars: number;
  debug: boolean;
}

export interface TraceSink {
  publishTurn(turn: CompletedTurn): Promise<void>;
}

export interface StateStore {
  load(sessionId: string): Promise<SessionState | null>;
  save(state: SessionState): Promise<void>;
  clear(sessionId: string): Promise<void>;
  withSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
