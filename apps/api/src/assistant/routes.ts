import type { AssistantEvent, AssistantRun } from "@faridalms/domain/assistant";

import { TenantUnavailableError } from "@faridalms/database/context";
import {
  assistantSettingsOf,
  finishAssistantRequest,
  holdAssistantDay,
  requestsOn,
  startAssistantRequest,
  studentNamesOf,
} from "@faridalms/database/stores/assistant";
import {
  assistantRunSchema,
  holdsStudentWork,
  MAX_ASSISTANT_CHARACTERS,
  nameGuard,
} from "@faridalms/domain/assistant";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";
import type { Job } from "./jobs";
import type { AssistantProvider } from "./provider";

import { audit, openUnit, schoolOf } from "../core/procedure";
import { refusalResponse } from "../core/refusal";
import { hostAccess } from "../files/authorize";
import { jobOf } from "./jobs";
import { ProviderError } from "./provider";

const PATH = "/v1/assistant/run";

/** How often a quiet answer still sends a line, so nothing between closes it as idle. */
const HEARTBEAT_MS = 5000;

function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

interface Prepared {
  requestId: string;
  provider: AssistantProvider;
  job: Job;
  remaining: number;
}

/**
 * Everything that decides whether the words may leave, in one unit of
 * work: a member of staff, at a school that turned its model on, writing
 * a record they may change whose document holds no student's work, within
 * the school's day. Only then is the prompt built, from the teacher's own
 * words with the school's students' names hidden, and the request
 * recorded and audited before anything is sent.
 */
async function prepare(
  context: UnitContext,
  input: AssistantRun,
): Promise<Prepared> {
  if (context.actor.workspace !== "staff")
    throw new ORPCError("FORBIDDEN", { message: "assistant.staff_only" });
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const settings = await assistantSettingsOf(context.tx, scope);
  if (!settings?.enabled)
    throw new ORPCError("FORBIDDEN", { message: "assistant.off" });
  const provider = context.assistant?.providers[settings.provider];
  if (!provider || !context.assistant)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "assistant.unavailable",
    });
  if ((await hostAccess(context, input.host)) !== "write")
    throw new ORPCError("NOT_FOUND");
  if (holdsStudentWork(input.content))
    throw new ORPCError("FORBIDDEN", { message: "assistant.student_work" });
  const job = jobOf(input, nameGuard(await studentNamesOf(context.tx, scope)));
  if (job.characters === 0)
    throw new ORPCError("BAD_REQUEST", {
      message: "assistant.nothing_to_send",
    });
  if (job.characters > MAX_ASSISTANT_CHARACTERS)
    throw new ORPCError("BAD_REQUEST", { message: "assistant.too_long" });
  await holdAssistantDay(context.tx, scope);
  const used = await requestsOn(context.tx, { ...scope, day: context.today });
  const limit = Math.min(settings.dailyLimit, context.assistant.dailyCeiling);
  if (used >= limit)
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "assistant.daily_limit",
    });
  const requestId = await startAssistantRequest(context.tx, {
    ...scope,
    userId: context.actor.userId,
    task: input.task,
    host: input.host,
    provider: provider.id,
    model: provider.model,
    day: context.today,
    sentCharacters: job.characters,
  });
  await audit(context, {
    action: "assistant.request",
    objectType: input.host.type,
    objectId: input.host.id,
    details: {
      task: input.task,
      provider: provider.id,
      model: provider.model,
      characters: job.characters,
    },
  });
  return { requestId, provider, job, remaining: limit - used - 1 };
}

const CODES: Record<ProviderError["reason"], string> = {
  busy: "assistant.busy",
  unavailable: "assistant.unavailable",
  rejected: "assistant.unavailable",
};

/**
 * The answer as it is written, one JSON event a line, ending with done or
 * with an error's code. Abandoned by the browser, the provider's request
 * is abandoned too. How it ended, and what it cost, is recorded after.
 */
function streamed(
  context: SchoolContext,
  prepared: Prepared,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const stop = () => abort.abort();
  signal.addEventListener("abort", stop, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => {
        if (!abort.signal.aborted)
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const beat = setInterval(() => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode("\n"));
      }, HEARTBEAT_MS);
      const reader = prepared.job.reader();
      let received = 0;
      let usage = {
        input: null as number | null,
        output: null as number | null,
      };
      let outcome: "done" | "failed" | "cancelled" = "failed";
      try {
        send({ type: "started", remaining: prepared.remaining });
        for await (const event of prepared.provider.stream(
          prepared.job.request,
          abort.signal,
        )) {
          if (event.type === "waiting") send(event);
          else if (event.type === "text") {
            received += event.text.length;
            for (const out of reader.text(event.text)) send(out);
          } else {
            usage = { input: event.inputTokens, output: event.outputTokens };
            const last =
              event.stop === "length"
                ? "assistant.too_long_answer"
                : event.stop === "refusal"
                  ? "assistant.declined"
                  : reader.end();
            if (typeof last === "string") send({ type: "error", code: last });
            else {
              for (const out of last) send(out);
              outcome = "done";
            }
          }
        }
      } catch (error) {
        if (abort.signal.aborted) outcome = "cancelled";
        else if (error instanceof ProviderError)
          send({ type: "error", code: CODES[error.reason] });
        else {
          console.error(
            JSON.stringify({
              requestId: context.requestId,
              assistant: error instanceof Error ? error.name : "unknown",
            }),
          );
          send({ type: "error", code: "assistant.unavailable" });
        }
      } finally {
        clearInterval(beat);
        signal.removeEventListener("abort", stop);
        try {
          await openUnit(context, "session", (unit) =>
            finishAssistantRequest(unit.tx, {
              tenantId: unit.tenantId,
              id: prepared.requestId,
              outcome,
              receivedCharacters: received,
              inputTokens: usage.input,
              outputTokens: usage.output,
            }),
          );
        } catch (error) {
          console.error(
            JSON.stringify({
              requestId: context.requestId,
              assistantRecord: error instanceof Error ? error.message : "",
            }),
          );
        }
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** A teacher's request to the school's language model, answered as a stream. */
export async function handleAssistantRequest(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  if (url.pathname !== PATH) return null;
  if (request.method !== "POST")
    return problem(405, "METHOD_NOT_SUPPORTED", context.requestId);
  const school = await schoolOf(context);
  if (!school) return problem(401, "UNAUTHORIZED", context.requestId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "BAD_REQUEST", context.requestId);
  }
  const parsed = v.safeParse(assistantRunSchema, body);
  if (!parsed.success) return problem(400, "BAD_REQUEST", context.requestId);
  const scoped: SchoolContext = { ...context, school };
  let prepared: Prepared;
  try {
    prepared = await openUnit(scoped, "write", (unit) =>
      prepare({ ...scoped, ...unit }, parsed.output),
    );
  } catch (error) {
    if (error instanceof ORPCError)
      return refusalResponse(error, context.requestId);
    if (error instanceof TenantUnavailableError)
      return error.reason === "unknown"
        ? problem(401, "UNAUTHORIZED", context.requestId)
        : error.reason === "paused"
          ? problem(403, "tenant.paused", context.requestId)
          : problem(503, "tenant.read_only", context.requestId);
    throw error;
  }
  return streamed(scoped, prepared, request.signal);
}
