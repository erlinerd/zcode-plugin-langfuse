import { LangfuseSpanProcessor, isLangfuseSpan } from "@langfuse/otel";
import {
  LangfuseOtelSpanAttributes,
  setLangfuseTracerProvider,
  startObservation,
} from "@langfuse/tracing";
import {
  AlwaysOnSampler,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import { PLUGIN_ID } from "../domain/identity.js";
import type { CompletedTurn, HookConfig, TraceSink } from "../domain/types.js";

const TRACE_NAME = "ZCode Turn";
const BASE_TAGS = ["zcode", "zcode-hook"];
const FLUSH_BUDGET_MS = 8_000;
const SHUTDOWN_BUDGET_MS = 5_000;

type ChatContent = { role: string; content: string };

function chatInput(prompt: string | null): ChatContent | undefined {
  return prompt === null ? undefined : { role: "user", content: prompt };
}

function chatOutput(message: string | null): ChatContent | undefined {
  return message === null
    ? undefined
    : { role: "assistant", content: message };
}

/** Raced completion so a hung Langfuse network call can never exceed the Stop hook budget. */
async function withBudget(
  task: Promise<void>,
  budgetMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      task,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, budgetMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class LangfuseTraceSink implements TraceSink {
  constructor(private readonly config: HookConfig) {}

  async publishTurn(turn: CompletedTurn): Promise<void> {
    if (!this.config.publicKey || !this.config.secretKey) return;

    // The Langfuse v4 events backend reads trace fields per span, so every
    // span must carry them; stamping in onStart covers observations created
    // anywhere without a global OTel context manager.
    const traceAttributes = {
      [LangfuseOtelSpanAttributes.TRACE_NAME]: TRACE_NAME,
      [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: turn.sessionId,
      [LangfuseOtelSpanAttributes.TRACE_TAGS]: BASE_TAGS,
      ...(this.config.userId
        ? { [LangfuseOtelSpanAttributes.TRACE_USER_ID]: this.config.userId }
        : {}),
    };

    const processor = new LangfuseSpanProcessor({
      publicKey: this.config.publicKey,
      secretKey: this.config.secretKey,
      baseUrl: this.config.baseUrl,
      environment: this.config.environment,
      release: this.config.release,
      // One span batch per publishTurn in a short-lived hook process.
      exportMode: "immediate",
      // Capture flags and size limits above are the only privacy levers; the
      // media upload path would add a second exfiltration route.
      mediaUploadEnabled: false,
      timeout: FLUSH_BUDGET_MS / 1000,
      shouldExportSpan: ({ otelSpan }) => isLangfuseSpan(otelSpan),
    });
    const baseOnStart = processor.onStart.bind(processor);
    processor.onStart = (span, parentContext) => {
      baseOnStart(span, parentContext);
      span.setAttributes(traceAttributes);
    };
    // Payload bounds are enforced by the capture flags and maxCaptureChars;
    // unlimited OTel limits keep those contracts authoritative.
    const provider = new NodeTracerProvider({
      spanProcessors: [processor],
      sampler: new AlwaysOnSampler(),
      spanLimits: {
        attributeValueLengthLimit: Infinity,
        attributeCountLimit: Infinity,
      },
    });
    setLangfuseTracerProvider(provider);

    try {
      const root = startObservation(TRACE_NAME, {
        input: chatInput(turn.prompt),
        metadata: {
          source: "zcode",
          plugin: PLUGIN_ID,
          turnId: turn.turnId,
          toolCount: turn.tools.length,
        },
      }, { asType: "span", startTime: new Date(turn.startedAt) });

      for (const tool of turn.tools) {
        const span = root.startObservation(`tool.${tool.name}`, {
          input: tool.input,
          metadata: {
            toolId: tool.id,
            startedAt: tool.startedAt,
            endedAt: tool.endedAt,
          },
        }, { asType: "tool" });
        if (tool.error) {
          span.update({
            output: { error: tool.error },
            level: "ERROR",
            statusMessage: tool.error,
          });
        } else {
          span.update({ output: tool.output });
        }
        span.end();
      }

      const generation = root.startObservation("zcode.assistant", {
        input: chatInput(turn.prompt),
        output: chatOutput(turn.assistantMessage),
        metadata: { turnId: turn.turnId },
      }, { asType: "generation" });
      generation.end();

      root.update({ output: chatOutput(turn.assistantMessage) });
      root.end();

      await withBudget(processor.forceFlush(), FLUSH_BUDGET_MS);
    } finally {
      setLangfuseTracerProvider(null);
      await withBudget(provider.shutdown(), SHUTDOWN_BUDGET_MS);
    }
  }
}
