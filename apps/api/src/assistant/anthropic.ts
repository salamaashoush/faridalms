import Anthropic, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";

import type {
  AssistantProvider,
  AssistantService,
  ProviderEvent,
} from "./provider";

import { pause, RateGate } from "./pacing";
import { ProviderError } from "./provider";

/** Room for the model's thinking and its answer; it is billed only for what it writes. */
const MAX_OUTPUT_TOKENS = 64_000;

/** Tries at one request when the provider asks us to come back later. */
const MAX_ATTEMPTS = 3;

/** The limits Anthropic reports on every answer, each with its own reset. */
const LIMITS = ["requests", "tokens", "input-tokens", "output-tokens"];

/**
 * Closes the gate until a limit's reset when the answer says nothing of it
 * remains. Anthropic replenishes continuously, so the reset is when the
 * whole limit is back, and the earliest any of it is.
 */
function observe(gate: RateGate, headers: Headers | undefined) {
  if (!headers) return;
  for (const limit of LIMITS) {
    const remaining = headers.get(`anthropic-ratelimit-${limit}-remaining`);
    const reset = headers.get(`anthropic-ratelimit-${limit}-reset`);
    if (remaining !== null && Number(remaining) <= 0 && reset)
      gate.holdUntil(Date.parse(reset));
  }
}

/** The seconds a refusal asks us to wait, or null when it names none. */
function retryAfter(headers: Headers | undefined): number | null {
  const value = headers?.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

const stopOf = (reason: string | null): "end" | "length" | "refusal" =>
  reason === "max_tokens" ? "length" : reason === "refusal" ? "refusal" : "end";

/**
 * Anthropic's Messages API, streamed. Requests are paced from the limits
 * each answer reports and the waits a refusal asks for; the SDK's own
 * retries are off so every wait goes through the one gate and the person
 * waiting is told. A model that declines falls back as Anthropic routes it.
 */
export function anthropicProvider(options: {
  apiKey: string;
  baseURL?: string;
  model: string;
}): AssistantProvider {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    maxRetries: 0,
  });
  const gate = new RateGate();
  return {
    id: "anthropic",
    model: options.model,
    async *stream(request, signal): AsyncGenerator<ProviderEvent> {
      for (let attempt = 1; ; attempt += 1) {
        const wait = gate.delay();
        if (wait > 0) {
          yield { type: "waiting", seconds: Math.ceil(wait / 1000) };
          await pause(wait, signal);
        }
        let written = false;
        try {
          const stream = client.beta.messages.stream(
            {
              model: options.model,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: request.system,
              messages: [{ role: "user", content: request.user }],
              output_config: {
                effort: "medium",
                ...(request.schema
                  ? { format: { type: "json_schema", schema: request.schema } }
                  : {}),
              },
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal },
          );
          const { response } = await stream.withResponse();
          observe(gate, response.headers);
          for await (const event of stream)
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              written = true;
              yield { type: "text", text: event.delta.text };
            }
          const message = await stream.finalMessage();
          const usage = message.usage;
          yield {
            type: "end",
            stop: stopOf(message.stop_reason),
            inputTokens:
              usage.input_tokens +
              (usage.cache_creation_input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0),
            outputTokens: usage.output_tokens,
          };
          return;
        } catch (error) {
          if (signal.aborted || error instanceof APIUserAbortError) throw error;
          if (error instanceof APIConnectionError)
            throw new ProviderError("unavailable");
          if (!(error instanceof APIError)) throw error;
          observe(gate, error.headers);
          const seconds = retryAfter(error.headers);
          const passing =
            error instanceof RateLimitError ||
            error instanceof InternalServerError;
          if (passing && seconds !== null && !written) {
            gate.holdFor(seconds);
            if (attempt < MAX_ATTEMPTS) continue;
          }
          if (error instanceof RateLimitError) throw new ProviderError("busy");
          if (error instanceof InternalServerError)
            throw new ProviderError("unavailable");
          throw new ProviderError("rejected");
        }
      }
    },
  };
}

/** The language model services the deployment's keys open; none without a key. */
export function assistantFrom(env: {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_API_URL?: string;
  ASSISTANT_MODEL: string;
  ASSISTANT_DAILY_CEILING: number;
}): AssistantService | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return {
    providers: {
      anthropic: anthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(env.ANTHROPIC_API_URL ? { baseURL: env.ANTHROPIC_API_URL } : {}),
        model: env.ASSISTANT_MODEL,
      }),
    },
    dailyCeiling: env.ASSISTANT_DAILY_CEILING,
  };
}
