import { createFileRoute } from "@tanstack/react-router";
import * as client from "openid-client";

import { callbackUrl, provider } from "../../server/oidc";
import { seal } from "../../server/seal";
import { cookie, loginCookie } from "../../server/session";

const LOGIN_SECONDS = 10 * 60;

/** Only a path of the console's own, so sign-in never sends anyone elsewhere. */
const returnPath = (value: string | null) =>
  value && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : "/";

/**
 * Sends an operator to the identity provider, with PKCE, state and nonce.
 * `?step=1` asks the provider to sign them in again however recent their
 * session there, for an action that needs a fresh sign-in.
 */
export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const stepUp = query.get("step") === "1";
        const back = returnPath(query.get("return"));
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
          ...(stepUp ? { max_age: "0", prompt: "login" } : {}),
        });
        return new Response(null, {
          status: 302,
          headers: {
            location: target.href,
            "set-cookie": cookie(
              loginCookie(),
              seal(
                "login",
                { verifier, state, nonce, stepUp, back },
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
