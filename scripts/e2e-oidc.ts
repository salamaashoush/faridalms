import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createHash, randomBytes } from "node:crypto";

/** Who the stand-in signs in, which a spec sets as a cookie on its origin. */
export interface StandInPerson {
  sub: string;
  email: string;
  name: string;
}

export const OIDC_CLIENT_ID = "farida-ops-e2e";
export const OIDC_PERSON_COOKIE = "e2e_person";

const DEFAULT_PERSON: StandInPerson = {
  sub: "e2e-owner",
  email: "salama@example.com",
  name: "Salama Ashoush",
};

interface Grant {
  person: StandInPerson;
  clientId: string;
  redirectUri: string;
  nonce: string | null;
  challenge: string;
  authTime: number;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

function personFrom(request: Request): StandInPerson {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OIDC_PERSON_COOKIE}=`))
    ?.slice(OIDC_PERSON_COOKIE.length + 1);
  if (!raw) return DEFAULT_PERSON;
  try {
    const value = JSON.parse(
      Buffer.from(raw, "base64url").toString(),
    ) as StandInPerson;
    return typeof value.sub === "string" &&
      typeof value.email === "string" &&
      typeof value.name === "string"
      ? value
      : DEFAULT_PERSON;
  } catch {
    return DEFAULT_PERSON;
  }
}

/**
 * An OpenID Connect provider as the operator console meets it in the
 * end-to-end gate: discovery, an authorization endpoint that signs in at
 * once whoever the spec named, a token endpoint that checks PKCE and the
 * client, and its keys. Every authorization is a fresh sign-in, so a
 * request for one with `max_age=0` is always met.
 */
export async function startOidcStandIn(port: number) {
  const issuer = `http://127.0.0.1:${port}`;
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "e2e",
    alg: "RS256",
    use: "sig",
  };
  const grants = new Map<string, Grant>();
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/.well-known/openid-configuration")
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: [
            "client_secret_basic",
            "client_secret_post",
            "none",
          ],
          scopes_supported: ["openid", "profile", "email"],
          claims_supported: [
            "sub",
            "email",
            "email_verified",
            "name",
            "auth_time",
          ],
        });
      if (url.pathname === "/jwks") return Response.json({ keys: [jwk] });
      if (url.pathname === "/authorize") {
        const query = url.searchParams;
        const redirectUri = query.get("redirect_uri");
        const challenge = query.get("code_challenge");
        if (
          query.get("response_type") !== "code" ||
          query.get("client_id") !== OIDC_CLIENT_ID ||
          !redirectUri ||
          !challenge ||
          query.get("code_challenge_method") !== "S256"
        )
          return new Response("invalid authorization request", { status: 400 });
        const code = base64url(randomBytes(24));
        grants.set(code, {
          person: personFrom(request),
          clientId: OIDC_CLIENT_ID,
          redirectUri,
          nonce: query.get("nonce"),
          challenge,
          authTime: Math.floor(Date.now() / 1000),
        });
        const back = new URL(redirectUri);
        back.searchParams.set("code", code);
        const state = query.get("state");
        if (state) back.searchParams.set("state", state);
        return Response.redirect(back.href, 302);
      }
      if (url.pathname === "/token" && request.method === "POST") {
        const form = new URLSearchParams(await request.text());
        const code = form.get("code") ?? "";
        const grant = grants.get(code);
        grants.delete(code);
        const verifier = form.get("code_verifier") ?? "";
        const digest = base64url(
          createHash("sha256").update(verifier).digest(),
        );
        const basic = request.headers.get("authorization");
        const clientId = basic?.startsWith("Basic ")
          ? decodeURIComponent(
              Buffer.from(basic.slice(6), "base64").toString().split(":")[0] ??
                "",
            )
          : form.get("client_id");
        if (
          !grant ||
          clientId !== grant.clientId ||
          form.get("grant_type") !== "authorization_code" ||
          form.get("redirect_uri") !== grant.redirectUri ||
          digest !== grant.challenge
        )
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        const now = Math.floor(Date.now() / 1000);
        const idToken = await new SignJWT({
          email: grant.person.email,
          email_verified: true,
          name: grant.person.name,
          auth_time: grant.authTime,
          ...(grant.nonce ? { nonce: grant.nonce } : {}),
        })
          .setProtectedHeader({ alg: "RS256", kid: "e2e" })
          .setIssuer(issuer)
          .setSubject(grant.person.sub)
          .setAudience(grant.clientId)
          .setIssuedAt(now)
          .setExpirationTime(now + 300)
          .sign(privateKey);
        return Response.json({
          access_token: base64url(randomBytes(24)),
          token_type: "Bearer",
          expires_in: 300,
          id_token: idToken,
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
}
