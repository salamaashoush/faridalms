import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deserialize, serialize } from "superjson";

import * as m from "~/i18n/messages";

import { getMessageFromError } from "./utils/error";

interface ServerFnErrorBody {
  result?: { message?: string };
  issues?: { message?: string }[];
  message?: string;
}

// Server function errors surface as an Error whose message is a JSON envelope.
// Unwrap it so the toast shows the underlying cause, not the envelope.
function unwrapServerFnMessage(message: string): string {
  let parsed: { body?: ServerFnErrorBody | string; message?: string };
  try {
    parsed = JSON.parse(message) as typeof parsed;
  } catch {
    return message;
  }

  const body = parsed.body;
  if (body === undefined) {
    return message;
  }
  if (typeof body === "string") {
    return body;
  }

  const issues = body.issues
    ?.map((issue) => issue.message)
    .filter((value): value is string => Boolean(value))
    .join(", ");

  return (
    body.result?.message ??
    (issues === undefined || issues === "" ? undefined : issues) ??
    body.message ??
    parsed.message ??
    message
  );
}

// The API names a decision with a dotted code: a system still moving to the
// cell, a refused permission, a rejected value. Asking again returns the same
// answer, and every mutation waits for its retries through the invalidation
// below, so only failures without a code are retried.
const DECIDED = /^[a-z][a-z_]*\.[a-z_.]+/;

function worthRetrying(failureCount: number, error: Error) {
  return (
    failureCount < 3 && !DECIDED.test(unwrapServerFnMessage(error.message))
  );
}

function onError(error: Error) {
  error.message = unwrapServerFnMessage(error.message);
  const description = getMessageFromError(error);
  // Callers that also report the failure reuse the message as the toast id,
  // so one failure shows one toast.
  toast.error(m.notificationErrorTitle(), { id: description, description });
}

export function createQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: serialize },
      hydrate: { deserializeData: deserialize },
      queries: {
        refetchOnReconnect: () => !queryClient.isMutating(),
        retry: worthRetrying,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        // A page of a system still moving says so in its own error view; a
        // background widget of one (the bell, a count) stays quiet instead of
        // raising the same toast on every page.
        error.message = unwrapServerFnMessage(error.message);
        if (error.message === "system.moving") return;
        onError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // A form that shows the failure beside its fields marks its mutation,
        // and a toast would only repeat what the person is already reading.
        if (mutation.meta?.inlineError === true) {
          error.message = unwrapServerFnMessage(error.message);
          return;
        }
        onError(error);
      },
      onSettled: () => {
        if (queryClient.isMutating() === 1) {
          return queryClient.invalidateQueries();
        }
        return undefined;
      },
    }),
  });

  return queryClient;
}
