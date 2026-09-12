import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { LangfuseTraceSink } from "../src/adapters/langfuse-sink.js";
import type { CompletedTurn, HookConfig } from "../src/domain/types.js";

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
  ],
};

describe("LangfuseTraceSink", () => {
  it("sends bundled-SDK ingestion events to the configured base URL", async () => {
    const requests: Array<{ path: string; body: string }> = [];
    const server: Server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        requests.push({ path: request.url ?? "", body });
        response.statusCode = 207;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ successes: [], errors: [] }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
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
      expect(
        requests.every((request) => request.path === "/api/public/ingestion"),
      ).toBe(true);
      const combined = requests.map((request) => request.body).join("\n");
      expect(combined).toContain("ZCode Turn");
      expect(combined).toContain("zcode.assistant");
      expect(combined).toContain("tool.Bash");
      expect(combined).not.toContain("secret-key-test");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
