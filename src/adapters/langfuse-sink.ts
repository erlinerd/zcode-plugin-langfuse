import { Langfuse } from "langfuse";
import type { CompletedTurn, HookConfig, TraceSink } from "../domain/types.js";

const SDK_INTEGRATION = "zcode-langfuse-observability";
const TRACE_NAME = "ZCode Turn";

export class LangfuseTraceSink implements TraceSink {
  constructor(private readonly config: HookConfig) {}

  async publishTurn(turn: CompletedTurn): Promise<void> {
    if (!this.config.publicKey || !this.config.secretKey) return;

    const client = new Langfuse({
      publicKey: this.config.publicKey,
      secretKey: this.config.secretKey,
      baseUrl: this.config.baseUrl,
      release: this.config.release,
      environment: this.config.environment,
      sdkIntegration: SDK_INTEGRATION,
      flushAt: 1,
      fetchRetryCount: 1,
      requestTimeout: 8_000,
    });

    try {
      type TraceInput = NonNullable<Parameters<Langfuse["trace"]>[0]>;
      const traceInput: TraceInput = {
        name: TRACE_NAME,
        sessionId: turn.sessionId,
        input: turn.prompt,
        metadata: {
          source: "zcode",
          turnId: turn.turnId,
          toolCount: turn.tools.length,
        },
        tags: ["zcode", "zcode-hook"],
      };
      if (this.config.userId) traceInput.userId = this.config.userId;
      const trace = client.trace(traceInput);

      for (const tool of turn.tools) {
        const span = trace.span({
          name: `tool.${tool.name}`,
          input: tool.input,
          metadata: {
            toolId: tool.id,
            startedAt: tool.startedAt,
            endedAt: tool.endedAt,
          },
        });
        if (tool.error) {
          span.end({
            output: { error: tool.error },
            level: "ERROR",
            statusMessage: tool.error,
          });
        } else {
          span.end({ output: tool.output });
        }
      }

      const generation = trace.generation({
        name: "zcode.assistant",
        input: turn.prompt,
        metadata: {
          turnId: turn.turnId,
        },
      });
      generation.end({ output: turn.assistantMessage });

      trace.update({
        output: turn.assistantMessage,
        metadata: {
          source: "zcode",
          turnId: turn.turnId,
          toolCount: turn.tools.length,
        },
      });

      await client.flushAsync();
    } finally {
      await client.shutdownAsync();
    }
  }
}
