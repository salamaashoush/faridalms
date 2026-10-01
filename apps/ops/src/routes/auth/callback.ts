import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import * as client from "openid-client";
import * as v from "valibot";

import { callbackUrl, operatorOf, provider } from "../../server/oidc";
import { unseal } from "../../server/seal";
import { cookie, loginCookie, sealSession } from "../../server/session";

const refused = (reason: string) =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/sign-in?error=${reason}`,
      "set-cookie": cookie(loginCookie(), "", 0),
    },
  });

/**
 * Finishes sign-in: the code is exchanged with the PKCE verifier, the state
 * and nonce checked, and only members of the operators' group get a session.
 */
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const pending = unseal(
          "login",
          getCookie(loginCookie()),
          v.object({
            verifier: v.string(),
            state: v.string(),
            nonce: v.string(),
          }),
        );
        if (!pending) return refused("expired");
        const config = await provider();
        // The provider returns to the console's public address, which the
        // request may not show behind a proxy.
        const current = new URL(new URL(request.url).search, callbackUrl());
        let claims: Record<string, unknown> | undefined;
        try {
          const tokens = await client.authorizationCodeGrant(config, current, {
            pkceCodeVerifier: pending.verifier,
            expectedState: pending.state,
            expectedNonce: pending.nonce,
          });
          claims = tokens.claims();
        } catch {
          return refused("failed");
        }
        const operator = claims ? operatorOf(claims) : "not_operator";
        if (operator === "not_operator") return refused("not_operator");
        const headers = new Headers({ location: "/" });
        headers.append("set-cookie", sealSession(operator));
        headers.append("set-cookie", cookie(loginCookie(), "", 0));
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
