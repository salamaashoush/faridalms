import { writeAudit } from "@faridalms/database/audit";
import { insertTool, useOnce } from "@faridalms/database/stores/lti";
import {
  LTI_AGS_SCOPES,
  LTI_MESSAGES,
  LTI_NRPS_SCOPE,
  LTI_PLATFORM_CONFIGURATION,
  LTI_TOOL_CONFIGURATION,
  ltiScopesOf,
  toolRegistrationOf,
} from "@faridalms/domain/lti";

import type { RequestContext, SchoolContext } from "../core/context";

import { namesPrivateHost } from "../files/fetch-link";
import { asSystem } from "./grades";
import { issuerOf, secretsFor } from "./shared";

/** How long a tool's maker has, from the school starting, to register it. */
const REGISTRATION_SECONDS = 3600;

/** What the school gives a tool to register itself once with, and only with it. */
interface RegistrationToken {
  kind: "registration";
  schoolId: string;
  id: string;
}

/**
 * The address a school administrator's browser opens to register a tool:
 * the one the tool's maker gave, with where the school describes itself
 * and a token that registers one tool, once, within the hour.
 */
export async function registrationAddress(
  context: RequestContext & { school: SchoolContext["school"] },
  toolUrl: string,
) {
  const token: RegistrationToken = {
    kind: "registration",
    schoolId: context.school.schoolId,
    id: crypto.randomUUID(),
  };
  const address = new URL(toolUrl);
  address.searchParams.set(
    "openid_configuration",
    `${issuerOf(context.school)}/openid-configuration`,
  );
  address.searchParams.set(
    "registration_token",
    await secretsFor(context).sign(token, REGISTRATION_SECONDS),
  );
  return address.toString();
}

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache" },
  });

/**
 * How the school describes itself to a tool registering with it, as LTI
 * Dynamic Registration and OpenID Connect discovery ask: its addresses,
 * how tools prove who they are, the services and messages it offers.
 */
export function openIdConfiguration(context: SchoolContext): Response {
  const issuer = issuerOf(context.school);
  return json({
    issuer,
    authorization_endpoint: `${issuer}/auth`,
    registration_endpoint: `${issuer}/register`,
    jwks_uri: `${issuer}/jwks`,
    token_endpoint: `${issuer}/token`,
    token_endpoint_auth_methods_supported: ["private_key_jwt"],
    token_endpoint_auth_signing_alg_values_supported: ["RS256"],
    scopes_supported: [
      "openid",
      ...Object.values(LTI_AGS_SCOPES),
      LTI_NRPS_SCOPE,
    ],
    response_types_supported: ["id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    claims_supported: ["sub", "iss", "name", "locale"],
    [LTI_PLATFORM_CONFIGURATION]: {
      product_family_code: "farida",
      version: "1",
      messages_supported: [
        { type: "LtiResourceLinkRequest" },
        {
          type: "LtiDeepLinkingRequest",
          placements: ["ContentArea", "RichTextEditor"],
        },
        { type: "LtiSubmissionReviewRequest" },
      ],
    },
  });
}

/**
 * The school's registration endpoint: a tool sends its configuration with
 * the token the school gave it, and is kept, waiting for the school to look
 * at it before anything launches it. The token is this school's, used
 * once; anything else is refused before the request is read.
 */
export async function registerTool(
  context: SchoolContext,
  request: Request,
): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? await secretsFor(context).read<RegistrationToken & { exp: number }>(
        header.slice(7),
      )
    : null;
  if (
    token?.kind !== "registration" ||
    token.schoolId !== context.school.schoolId
  )
    return json({ error: "invalid_token" }, 401);
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json"))
    return json({ error: "invalid_client_metadata" }, 400);
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_client_metadata" }, 400);
  }
  const read = toolRegistrationOf(body);
  if ("error" in read) return json({ error: read.error }, 400);
  // The server fetches the tool's keys, so they must be on the public web.
  if (namesPrivateHost(new URL(read.tool.jwksUrl)))
    return json({ error: "invalid_client_metadata" }, 400);
  const tenantId = context.school.tenantId;
  const clientId = crypto.randomUUID();
  const deploymentId = crypto.randomUUID();
  const made = await context.cell.withTenant(
    asSystem(context),
    "write",
    async (tx) => {
      const fresh = await useOnce(tx, {
        tenantId,
        key: `registration:${token.id}`,
        expiresAt: new Date((token.exp + 60) * 1000),
      });
      if (!fresh) return null;
      const created = await insertTool(tx, {
        tenantId,
        orgId: context.school.schoolId,
        ...read.tool,
        deepLinkUrl: read.tool.deepLinkUrl || null,
        reviewUrl: read.tool.reviewUrl || null,
        custom: read.tool.custom,
        clientId,
        deploymentId,
        registration: { ...read.registration },
      });
      await writeAudit(tx, tenantId, {
        action: "lti_tool.registered",
        objectType: "lti_tool",
        objectId: created.id,
        orgId: context.school.schoolId,
        details: { name: read.tool.name, domain: read.registration.domain },
      });
      return created;
    },
  );
  if (!made) return json({ error: "invalid_token" }, 401);
  const tool = read.tool;
  const messages = [
    ...(tool.deepLinkUrl
      ? [{ type: "LtiDeepLinkingRequest", target_link_uri: tool.deepLinkUrl }]
      : []),
    ...(tool.reviewUrl
      ? [
          {
            type: "LtiSubmissionReviewRequest",
            target_link_uri: tool.reviewUrl,
          },
        ]
      : []),
  ].filter((message) =>
    (LTI_MESSAGES as readonly string[]).includes(message.type),
  );
  return json(
    {
      client_id: clientId,
      application_type: "web",
      response_types: ["id_token"],
      grant_types: ["implicit", "client_credentials"],
      initiate_login_uri: tool.loginUrl,
      redirect_uris: tool.redirectUrls,
      client_name: tool.name,
      jwks_uri: tool.jwksUrl,
      token_endpoint_auth_method: "private_key_jwt",
      scope: ltiScopesOf(tool).join(" "),
      [LTI_TOOL_CONFIGURATION]: {
        domain: read.registration.domain,
        target_link_uri: tool.launchUrl,
        custom_parameters: tool.custom,
        claims: ["iss", "sub"],
        messages,
        deployment_id: deploymentId,
      },
    },
    201,
  );
}
