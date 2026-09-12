import type { HookEventName, HookPayload, JsonValue } from "./types.js";

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(toJsonValue);
    return values.every((item): item is JsonValue => item !== undefined)
      ? values
      : undefined;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of entries) {
      const parsed = toJsonValue(item);
      if (parsed === undefined) return undefined;
      result[key] = parsed;
    }
    return result;
  }
  return undefined;
}

function valueAt(
  payload: HookPayload,
  ...keys: string[]
): JsonValue | undefined {
  for (const key of keys) {
    const value = toJsonValue(payload[key]);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function asString(value: JsonValue | undefined): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

export function stringifyValue(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  const json = JSON.stringify(value);
  return json ?? String(value);
}

export function eventName(payload: HookPayload): HookEventName | null {
  return asString(
    valueAt(payload, "hook_event_name", "hookEventName", "event", "event_name"),
  ) as HookEventName | null;
}

export function sessionId(payload: HookPayload): string | null {
  const value = asString(valueAt(payload, "session_id", "sessionId"));
  return value?.trim() || null;
}

export function prompt(payload: HookPayload): string | null {
  const value = valueAt(
    payload,
    "prompt",
    "user_prompt",
    "userPrompt",
    "message",
  );
  return value === undefined ? null : stringifyValue(value);
}

export function assistantMessage(payload: HookPayload): string | null {
  const value = valueAt(
    payload,
    "last_assistant_message",
    "lastAssistantMessage",
  );
  return value === undefined ? null : stringifyValue(value);
}

export function toolId(payload: HookPayload): string | null {
  const value = asString(
    valueAt(payload, "tool_use_id", "toolUseId", "tool_id", "toolId", "id"),
  );
  return value?.trim() || null;
}

export function toolName(payload: HookPayload): string {
  return (
    asString(
      valueAt(payload, "tool_name", "toolName", "name", "tool"),
    )?.trim() ?? "unknown"
  );
}

export function toolInput(payload: HookPayload): JsonValue {
  return (
    valueAt(payload, "tool_input", "toolInput", "input", "arguments") ?? null
  );
}

export function toolOutput(payload: HookPayload): JsonValue {
  return (
    valueAt(
      payload,
      "tool_output",
      "toolOutput",
      "output",
      "result",
      "tool_response",
    ) ?? null
  );
}

export function toolError(payload: HookPayload): string {
  return stringifyValue(
    valueAt(payload, "error", "error_message", "errorMessage", "message") ??
      "Tool failed",
  );
}
