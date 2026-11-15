import { clientAddress } from "@faridalms/domain/forwarded";
import { getRequestHeader } from "@tanstack/react-start/server";

import { opsEnv } from "./env";

/** Where a customer's request came from and in what, as its evidence. */
export function requestOrigin() {
  return {
    ip: clientAddress(
      getRequestHeader("x-forwarded-for"),
      opsEnv().TRUSTED_PROXY_HOPS,
    ),
    userAgent: getRequestHeader("user-agent")?.slice(0, 500) ?? null,
  };
}
