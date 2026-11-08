import type { LtiLink } from "@faridalms/domain/lti";

import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { SignJWT } from "jose";

import { raw, seeded, sessionFor } from "./harness";

/** What the outside-tool tests share: a tool's side of the conversation. */

export const TITLE = "Reading stories together";
export const TOOL = "https://tool.example.com";

/** The fields of a page that posts itself on, and where it posts them. */
export function posted(html: string) {
  const action = /<form method="post" action="([^"]+)"/.exec(html)?.[1] ?? "";
  const fields = Object.fromEntries(
    [...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [
      match[1],
      (match[2] ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
    ]),
  );
  return { action: action.replaceAll("&amp;", "&"), fields };
}

/** A tool's answer to a pick, posted back as it comes from the tool's site. */
export const returned = (jwt: string) =>
  raw("northwind", "", "/lti/deep-link", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ JWT: jwt }).toString(),
  });

/** What the answer's page hands to the editor waiting for it. */
export const handed = (html: string) =>
  JSON.parse(
    /c\.postMessage\((.*?)\);c\.close/.exec(html)?.[1] ?? "null",
  ) as unknown;

/** A launch carried through the tool's sign-in to the token it is posted. */
export async function launchToken(
  token: string,
  userId: string,
  clientId: string,
  start: string,
) {
  const started = posted(await (await raw("northwind", token, start)).text());
  const answer = posted(
    await (
      await raw(
        "northwind",
        token,
        `/lti/auth?${new URLSearchParams({
          scope: "openid",
          response_type: "id_token",
          response_mode: "form_post",
          prompt: "none",
          client_id: clientId,
          redirect_uri: `${TOOL}/launch`,
          login_hint: userId,
          lti_message_hint: started.fields.lti_message_hint ?? "",
          nonce: crypto.randomUUID(),
          state: "s",
        })}`,
      )
    ).text(),
  );
  return answer.fields.id_token ?? "";
}

/** A tool's proof of who it is, as it asks the school for a token. */
export const assertion = (
  clientId: string,
  key: CryptoKey,
  kid: string,
  audience = "https://localhost/lti/token",
) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

/** A tool asking the school's token endpoint for the scopes named. */
export const askToken = (jwt: string, scope: string) =>
  raw("northwind", "", "/lti/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: jwt,
      scope,
    }).toString(),
  });

/** A service address a launch named, as the API is reached here. */
export const local = (url: string) => url.replace("https://localhost", "");

/** A lesson in the seeded module with a link to the tool in it. */
export async function lessonWithLink(
  toolId: string,
  link: Partial<LtiLink> = {},
) {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  let keeper: Awaited<ReturnType<typeof sessionFor>> | null = null;
  for (const row of tenant?.logins ?? []) {
    if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
    const session = await sessionFor("northwind", row.loginName);
    const { rows } = await session.api.learning.modules({});
    if (rows.some((item) => item.title === TITLE)) keeper ??= session;
  }
  if (!keeper) throw new Error("no teacher of the module");
  const source = (await keeper.api.learning.modules({})).rows.find(
    (row) => row.title === TITLE,
  );
  if (!source) throw new Error("no module");
  const saved = await keeper.api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title: "Rivers outside",
    summary: "",
    classIds: source.classes.map((item) => item.id),
    prerequisiteId: "",
    sequential: false,
  });
  const document = contentOfLesson({ version: 2, blocks: [] });
  if (!document) throw new Error("no document");
  const linkId = crypto.randomUUID();
  document.root.children = [
    ...(document.root.children ?? []),
    {
      type: "lti",
      version: 1,
      lti: {
        linkId,
        toolId,
        title: "Flood simulator",
        custom: { level: "2" },
        ...link,
      },
    },
  ];
  const lesson = await keeper.api.learning.saveLesson({
    id: "",
    moduleId: saved.id,
    expectedVersion: 0,
    title: "Simulate a flood",
    completion: "view",
    passScore: null,
    content: document,
    publish: false,
  });
  await keeper.api.learning.publishModule({
    id: saved.id,
    expectedVersion: saved.version,
  });
  return {
    keeper,
    lessonId: lesson.id,
    linkId,
    moduleId: saved.id,
    classIds: source.classes.map((item) => item.id),
  };
}
