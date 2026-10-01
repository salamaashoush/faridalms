import { createFileRoute } from "@tanstack/react-router";
import * as client from "openid-client";

import { callbackUrl, provider } from "../../server/oidc";
import { seal } from "../../server/seal";
import { cookie, loginCookie } from "../../server/session";

const LOGIN_SECONDS = 10 * 60;

/** Sends an operator to the identity provider, with PKCE, state and nonce. */
export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: async () => {
        const config = await provider();
        const verifier = client.randomPKCECodeVerifier();
        const state = client.randomState();
        const nonce = client.randomNonce();
        const target = client.buildAuthorizationUrl(config, {
          redirect_uri: callbackUrl(),
          scope: "openid profile email",
          code_challenge: await client.calculatePKCECodeChallenge(verifier),
          code_challenge_method: "S256",
          state,
          nonce,
        });
        return new Response(null, {
          status: 302,
          headers: {
            location: target.href,
            "set-cookie": cookie(
              loginCookie(),
              seal(
                "login",
                { verifier, state, nonce },
                Math.floor(Date.now() / 1000) + LOGIN_SECONDS,
              ),
              LOGIN_SECONDS,
            ),
          },
        });
      },
    },
  },
});
