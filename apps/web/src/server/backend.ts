import { createApiClient } from "@faridalms/api-client";
import { getCookie } from "@tanstack/react-start/server";

import { env } from "~/env";

export const SESSION_COOKIE = "faridalms-session";

export function backend() {
  return createApiClient({
    url: `${env.BACKEND_URL}/rpc`,
    token: getCookie(SESSION_COOKIE),
  });
}
