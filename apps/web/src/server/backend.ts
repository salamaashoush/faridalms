import { createApiClient, isHiddenRecordError } from "@faridalms/api-client";
import { notFound } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";

import { env } from "~/env";

export const SESSION_COOKIE = "faridalms-session";

export function backend() {
  return createApiClient({
    url: `${env.BACKEND_URL}/rpc`,
    token: getCookie(SESSION_COOKIE),
  });
}

/**
 * A record the API will not show becomes the router's not-found, so a stale,
 * guessed or out-of-scope URL renders the not-found page with a 404 instead
 * of the error boundary with a 500.
 */
export async function record<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (isHiddenRecordError(error)) throw notFound();
    throw error;
  }
}
