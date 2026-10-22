import { contentOfLesson } from "@faridalms/domain/lesson-content";
import {
  LTI_CLAIM,
  LTI_DL_CLAIM,
  LTI_ROLES,
  LTI_VERSION,
} from "@faridalms/domain/lti";
import { describe, expect, spyOn, test } from "bun:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from "jose";

import { login, raw, rejection, seeded, sessionFor, signedIn } from "./harness";

const TITLE = "Reading stories together";
const TOOL = "https://tool.example.com";

/** The fields of a page that posts itself on, and where it posts them. */
function posted(html: string) {
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
const returned = (jwt: string) =>
  raw("northwind", "", "/lti/deep-link", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ JWT: jwt }).toString(),
  });

/** What the answer's page hands to the editor waiting for it. */
const handed = (html: string) =>
  JSON.parse(
    /c\.postMessage\((.*?)\);c\.close/.exec(html)?.[1] ?? "null",
  ) as unknown;

/** A lesson in the seeded module with a link to the tool in it. */
async function lessonWithLink(toolId: string) {
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
  return { keeper, lessonId: lesson.id, linkId, moduleId: saved.id };
}

describe("outside tools by LTI 1.3", () => {
  test("a student launches a tool from a lesson, signed in as themselves", async () => {
    const office = await signedIn("northwind", login("principal"));
    const registered = await office.lti.saveTool({
      name: "Flood simulator",
      loginUrl: `${TOOL}/login`,
      launchUrl: `${TOOL}/launch`,
      redirectUrls: [`${TOOL}/launch`],
      jwksUrl: `${TOOL}/jwks`,
      sendNames: true,
      custom: { school: "northwind" },
    });
    const { tools, platform } = await office.lti.tools();
    const tool = tools.find((row) => row.id === registered.id);
    if (!tool) throw new Error("tool not registered");
    expect(platform.issuer).toBe("https://localhost/lti");
    expect(
      await rejection(
        (await signedIn("northwind", login("teacher"))).lti.saveTool({
          name: "Mine",
          loginUrl: `${TOOL}/login`,
          launchUrl: `${TOOL}/launch`,
          redirectUrls: [`${TOOL}/launch`],
          jwksUrl: `${TOOL}/jwks`,
          sendNames: false,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const { keeper, lessonId, linkId } = await lessonWithLink(tool.id);
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const started = await raw(
      "northwind",
      pupil.token,
      `/lti/launch?host=lesson&id=${lessonId}&link=${linkId}`,
    );
    expect(started.status).toBe(200);
    const login1 = posted(await started.text());
    expect(login1.action).toBe(`${TOOL}/login`);
    expect(login1.fields).toMatchObject({
      iss: "https://localhost/lti",
      login_hint: me.id,
      target_link_uri: `${TOOL}/launch`,
      client_id: tool.clientId,
      lti_deployment_id: tool.deploymentId,
    });

    const ask = (token: string, change: Record<string, string> = {}) =>
      raw(
        "northwind",
        token,
        `/lti/auth?${new URLSearchParams({
          scope: "openid",
          response_type: "id_token",
          response_mode: "form_post",
          prompt: "none",
          client_id: tool.clientId,
          redirect_uri: `${TOOL}/launch`,
          login_hint: me.id,
          lti_message_hint: login1.fields.lti_message_hint ?? "",
          nonce: "n-1",
          state: "s-1",
          ...change,
        })}`,
      );
    // An address the tool never registered is refused here, not followed.
    expect(
      (await ask(pupil.token, { redirect_uri: `${TOOL}/evil` })).status,
    ).toBe(400);
    // Someone else's browser cannot finish the student's launch.
    const other = posted(await (await ask(keeper.token)).text());
    expect(other.fields).toMatchObject({
      error: "login_required",
      state: "s-1",
    });

    const answer = posted(await (await ask(pupil.token)).text());
    expect(answer.action).toBe(`${TOOL}/launch`);
    expect(answer.fields.state).toBe("s-1");
    const keys = await (await raw("northwind", pupil.token, "/lti/jwks")).json();
    const { payload, protectedHeader } = await jwtVerify(
      answer.fields.id_token ?? "",
      createLocalJWKSet(keys as { keys: [] }),
      { issuer: "https://localhost/lti", audience: tool.clientId },
    );
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload).toMatchObject({
      sub: me.id,
      nonce: "n-1",
      azp: tool.clientId,
      [LTI_CLAIM.messageType]: "LtiResourceLinkRequest",
      [LTI_CLAIM.version]: "1.3.0",
      [LTI_CLAIM.deploymentId]: tool.deploymentId,
      [LTI_CLAIM.targetLinkUri]: `${TOOL}/launch`,
      [LTI_CLAIM.resourceLink]: {
        id: `${lessonId}:${linkId}`,
        title: "Flood simulator",
      },
      [LTI_CLAIM.roles]: [...LTI_ROLES.learner],
      [LTI_CLAIM.custom]: { school: "northwind", level: "2" },
    });
    expect(payload.name).toBeTruthy();

    // The lesson's teacher launches the same link as its instructor.
    const theirs = posted(
      await (
        await raw(
          "northwind",
          keeper.token,
          `/lti/launch?host=lesson&id=${lessonId}&link=${linkId}`,
        )
      ).text(),
    );
    const teacherMe = await keeper.api.identity.currentUser();
    const taught = posted(
      await (
        await ask(keeper.token, {
          login_hint: teacherMe.id,
          lti_message_hint: theirs.fields.lti_message_hint ?? "",
        })
      ).text(),
    );
    const { payload: instructor } = await jwtVerify(
      taught.fields.id_token ?? "",
      createLocalJWKSet(keys as { keys: [] }),
    );
    expect(instructor[LTI_CLAIM.roles]).toEqual([...LTI_ROLES.instructor]);

    // A link the student cannot reach does not launch.
    expect(
      (
        await raw(
          "northwind",
          pupil.token,
          `/lti/launch?host=lesson&id=${lessonId}&link=${crypto.randomUUID()}`,
        )
      ).status,
    ).toBe(404);
  });

  test("a teacher picks a tool's content for a link, which only the tool can hand back", async () => {
    const office = await signedIn("northwind", login("principal"));
    const registered = await office.lti.saveTool({
      name: "Simulation library",
      loginUrl: `${TOOL}/login`,
      launchUrl: `${TOOL}/launch`,
      redirectUrls: [`${TOOL}/launch`],
      jwksUrl: `${TOOL}/library/jwks`,
      deepLinkUrl: `${TOOL}/library/pick`,
      sendNames: false,
    });
    const tool = (await office.lti.tools()).tools.find(
      (row) => row.id === registered.id,
    );
    if (!tool) throw new Error("tool not registered");
    const { keeper, lessonId } = await lessonWithLink(tool.id);
    const teacher = await keeper.api.identity.currentUser();
    const pickId = crypto.randomUUID();
    const start = (token: string) =>
      raw(
        "northwind",
        token,
        `/lti/pick?${new URLSearchParams({ host: "lesson", id: lessonId, tool: tool.id, pick: pickId })}`,
      );
    // Only someone who may change the lesson picks content for it.
    const pupil = await sessionFor("northwind", login("student"));
    expect((await start(pupil.token)).status).toBe(404);

    const login1 = posted(await (await start(keeper.token)).text());
    expect(login1.action).toBe(`${TOOL}/login`);
    expect(login1.fields.target_link_uri).toBe(`${TOOL}/library/pick`);
    const answer = posted(
      await (
        await raw(
          "northwind",
          keeper.token,
          `/lti/auth?${new URLSearchParams({
            scope: "openid",
            response_type: "id_token",
            response_mode: "form_post",
            prompt: "none",
            client_id: tool.clientId,
            redirect_uri: `${TOOL}/launch`,
            login_hint: teacher.id,
            lti_message_hint: login1.fields.lti_message_hint ?? "",
            nonce: "n-pick",
            state: "s-pick",
          })}`,
        )
      ).text(),
    );
    const keys = await (await raw("northwind", keeper.token, "/lti/jwks")).json();
    const { payload: request } = await jwtVerify(
      answer.fields.id_token ?? "",
      createLocalJWKSet(keys as { keys: [] }),
      { issuer: "https://localhost/lti", audience: tool.clientId },
    );
    expect(request).toMatchObject({
      sub: teacher.id,
      [LTI_CLAIM.messageType]: "LtiDeepLinkingRequest",
      [LTI_CLAIM.targetLinkUri]: `${TOOL}/library/pick`,
      [LTI_CLAIM.roles]: [...LTI_ROLES.instructor],
      [LTI_DL_CLAIM.settings]: {
        deep_link_return_url: "https://localhost/lti/deep-link",
        accept_types: ["ltiResourceLink"],
        accept_multiple: false,
      },
    });
    expect(request[LTI_CLAIM.resourceLink]).toBeUndefined();
    const data = (request[LTI_DL_CLAIM.settings] as { data: string }).data;

    // The tool signs what the teacher picked with a key it publishes.
    const pair = await generateKeyPair("RS256");
    const forger = await generateKeyPair("RS256");
    const published = {
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "tool-1" }],
    };
    const fetched = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: string | URL | Request) =>
          (input instanceof Request ? input.url : input.toString()) ===
          `${TOOL}/library/jwks`
            ? Response.json(published)
            : Response.json({}, { status: 404 }),
        { preconnect: () => undefined },
      ),
    );
    try {
      const response = (
        claims: Record<string, unknown>,
        key: CryptoKey = pair.privateKey,
      ) =>
        new SignJWT({
          nonce: crypto.randomUUID(),
          [LTI_CLAIM.messageType]: "LtiDeepLinkingResponse",
          [LTI_CLAIM.version]: LTI_VERSION,
          [LTI_CLAIM.deploymentId]: tool.deploymentId,
          [LTI_DL_CLAIM.data]: data,
          [LTI_DL_CLAIM.contentItems]: [
            {
              type: "ltiResourceLink",
              title: "Rivers in flood",
              url: `${TOOL}/sims/flood`,
              custom: { sim: "flood" },
              lineItem: { scoreMaximum: 10 },
            },
          ],
          ...claims,
        })
          .setProtectedHeader({ alg: "RS256", kid: "tool-1" })
          .setIssuer(tool.clientId)
          .setAudience("https://localhost/lti")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(key);

      // It comes back without the teacher's session, from the tool's site.
      const jwt = await response({});
      const back = await returned(jwt);
      expect(back.status).toBe(200);
      expect(handed(await back.text())).toEqual({
        pickId,
        item: {
          title: "Rivers in flood",
          url: `${TOOL}/sims/flood`,
          custom: { sim: "flood" },
          lineItem: { label: "Rivers in flood", scoreMaximum: 10 },
        },
      });
      // The same answer is taken once.
      expect((await returned(jwt)).status).toBe(400);
      // An answer the tool did not sign, or data this school never gave, is refused.
      expect(
        (await returned(await response({}, forger.privateKey))).status,
      ).toBe(400);
      expect(
        (await returned(await response({ [LTI_DL_CLAIM.data]: "forged.data" })))
          .status,
      ).toBe(400);
      // A teacher who picked nothing is let go, and the editor stops waiting.
      expect(
        handed(
          await (
            await returned(await response({ [LTI_DL_CLAIM.contentItems]: [] }))
          ).text(),
        ),
      ).toEqual({ pickId, item: null });
    } finally {
      fetched.mockRestore();
    }
  });
});
