import type { AssistantProviderId } from "@faridalms/domain/assistant";

/** What a request asks the model: its standing instructions and the teacher's words. */
export interface ProviderRequest {
  system: string;
  user: string;
  /** A JSON Schema the answer must follow; without one it answers in plain text. */
  schema?: Record<string, unknown>;
}

export type ProviderEvent =
  /** The provider's limits ask for a pause before the request goes. */
  | { type: "waiting"; seconds: number }
  | { type: "text"; text: string }
  | {
      type: "end";
      /** Finished, cut off at its length, or declined by the model. */
      stop: "end" | "length" | "refusal";
      inputTokens: number | null;
      outputTokens: number | null;
    };

/**
 * A language model service behind one small interface, so a school's
 * choice of provider changes nothing above it. `stream` answers one
 * request as it is written and stops when `signal` aborts.
 */
export interface AssistantProvider {
  id: AssistantProviderId;
  model: string;
  stream: (
    request: ProviderRequest,
    signal: AbortSignal,
  ) => AsyncIterable<ProviderEvent>;
}

/**
 * A provider that could not answer: busy past what its limits let us wait
 * for, unreachable or failing, or refusing the request itself (a key it no
 * longer accepts, a request it cannot take).
 */
export class ProviderError extends Error {
  constructor(readonly reason: "busy" | "unavailable" | "rejected") {
    super(`Provider ${reason}`);
    this.name = "ProviderError";
  }
}

/** The providers a deployment holds keys for, and the most a school may send in a day. */
export interface AssistantService {
  providers: Partial<Record<AssistantProviderId, AssistantProvider>>;
  dailyCeiling: number;
}
