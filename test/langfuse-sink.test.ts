import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LangfuseTraceSink } from "../src/adapters/langfuse-sink.js";
import type { CompletedTurn, HookConfig } from "../src/domain/types.js";

interface DecodedSpan {
  name: string;
  spanId: string;
  parentSpanId: string;
  attributes: Record<string, unknown>;
}

// OTLP/JSON wire model: the http exporter serializes span ids as hex.
type OtlpValue = {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: number | string;
  doubleValue?: number;
  arrayValue?: { values?: OtlpValue[] };
  kvlistValue?: { values?: Array<{ key: string; value?: OtlpValue }> };
};

function unwrapValue(value: OtlpValue | undefined): unknown {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(unwrapValue);
  if (value.kvlistValue) {
    return Object.fromEntries(
      (value.kvlistValue.values ?? []).map((entry) => [
        entry.key,
        unwrapValue(entry.value),
      ]),
    );
  }
  return undefined;
}

function unwrapSpans(body: string): DecodedSpan[] {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null) return [];
  const { resourceSpans } = parsed as {
    resourceSpans?: Array<{
      scopeSpans?: Array<{
        spans?: Array<{
          name?: string;
          spanId?: string;
          parentSpanId?: string;
          attributes?: Array<{ key: string; value?: OtlpValue }>;
        }>;
      }>;
    }>;
  };
  const spans: DecodedSpan[] = [];
  for (const resourceSpan of resourceSpans ?? []) {
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        spans.push({
          name: span.name ?? "",
          spanId: span.spanId ?? "",
          parentSpanId: span.parentSpanId ?? "",
          attributes: Object.fromEntries(
            (span.attributes ?? []).map((attribute) => [
              attribute.key,
              unwrapValue(attribute.value),
            ]),
          ),
        });
      }
    }
  }
  return spans;
}

const turn: CompletedTurn = {
  sessionId: "session-test",
  turnId: "turn-test",
  prompt: "hello",
  assistantMessage: "world",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:01.000Z",
  tools: [
    {
      id: "tool-test",
      name: "Bash",
      input: { command: "true" },
      output: { exitCode: 0 },
      error: null,
      startedAt: "2026-01-01T00:00:00.100Z",
      endedAt: "2026-01-01T00:00:00.200Z",
    },
    {
      id: "tool-fail",
      name: "WebFetch",
      input: { url: "https://example.invalid" },
      output: null,
      error: "connection refused",
      startedAt: "2026-01-01T00:00:00.300Z",
      endedAt: "2026-01-01T00:00:00.400Z",
    },
  ],
};

const requests: Array<{
  path: string;
  auth: string;
  contentType: string;
  body: string;
}> = [];

const server: Server = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk: string) => {
    body += chunk;
  });
  request.on("end", () => {
    requests.push({
      path: request.url ?? "",
      auth: request.headers.authorization ?? "",
      contentType: request.headers["content-type"] ?? "",
      body,
    });
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ partialSuccess: {} }));
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("LangfuseTraceSink", () => {
  it("exports spans over OTLP to the configured base URL", async () => {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("test server did not bind");
    const config: HookConfig = {
      publicKey: "public-key-test",
      secretKey: "secret-key-test",
      baseUrl: `http://127.0.0.1:${address.port}`,
      userId: "user-test",
      environment: "test",
      release: "test",
      enabled: true,
      capturePrompts: true,
      captureToolInputs: true,
      captureToolOutputs: true,
      maxCaptureChars: 200,
      debug: false,
    };

    await new LangfuseTraceSink(config).publishTurn(turn);

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.path === "/api/public/otel/v1/traces")).toBe(
      true,
    );
    const expectedAuth = `Basic ${Buffer.from(
      "public-key-test:secret-key-test",
    ).toString("base64")}`;
    expect(requests.every((r) => r.auth === expectedAuth)).toBe(true);
    expect(
      requests.every((r) => r.contentType.startsWith("application/json")),
    ).toBe(true);

    const spans = requests.flatMap((request) => unwrapSpans(request.body));
    const names = spans.map((span) => span.name).sort();
    expect(names).toEqual(
      ["ZCode Turn", "tool.Bash", "tool.WebFetch", "zcode.assistant"].sort(),
    );

    const root = spans.find((span) => span.name === "ZCode Turn");
    if (!root) throw new Error("root span missing");
    expect(root.parentSpanId).toBe("");

    for (const span of spans) {
      expect(span.attributes["session.id"]).toBe("session-test");
      expect(span.attributes["langfuse.trace.name"]).toBe("ZCode Turn");
      expect(span.attributes["langfuse.trace.tags"]).toEqual([
        "zcode",
        "zcode-hook",
      ]);
      expect(span.attributes["user.id"]).toBe("user-test");
      expect(span.attributes["langfuse.environment"]).toBe("test");
      expect(span.attributes["langfuse.release"]).toBe("test");
    }

    for (const child of spans.filter((span) => span !== root)) {
      expect(child.parentSpanId).toBe(root.spanId);
      expect(child.attributes["langfuse.observation.type"]).toBe(
        child.name === "zcode.assistant" ? "generation" : "tool",
      );
    }

    expect(root.attributes["langfuse.observation.input"]).toContain("hello");
    expect(root.attributes["langfuse.observation.output"]).toContain("world");
    expect(root.attributes["langfuse.observation.metadata.turnId"]).toBe(
      "turn-test",
    );

    const bash = spans.find((span) => span.name === "tool.Bash");
    if (!bash) throw new Error("tool.Bash span missing");
    expect(bash.attributes["langfuse.observation.input"]).toContain("command");
    expect(bash.attributes["langfuse.observation.output"]).toContain(
      "exitCode",
    );
    expect(bash.attributes["langfuse.observation.level"]).toBeUndefined();

    const failed = spans.find((span) => span.name === "tool.WebFetch");
    if (!failed) throw new Error("tool.WebFetch span missing");
    expect(failed.attributes["langfuse.observation.level"]).toBe("ERROR");
    expect(failed.attributes["langfuse.observation.status_message"]).toBe(
      "connection refused",
    );

    const generation = spans.find((span) => span.name === "zcode.assistant");
    if (!generation) throw new Error("zcode.assistant span missing");
    expect(generation.attributes["langfuse.observation.output"]).toContain(
      "world",
    );

    expect(requests.map((request) => request.body).join("\n")).not.toContain(
      "secret-key-test",
    );
  });
});
