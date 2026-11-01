import type { ORPCError } from "@orpc/server";

const CODE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/**
 * A refusal as a route outside the RPC handler answers it: the refusal's
 * own code where it names one, as the RPC transport carries it, so the
 * reader can say what went wrong, and its status's code otherwise.
 */
export function refusalResponse(
  error: ORPCError<string, unknown>,
  requestId: string,
) {
  return Response.json(
    { code: CODE.test(error.message) ? error.message : error.code, requestId },
    { status: error.status },
  );
}
