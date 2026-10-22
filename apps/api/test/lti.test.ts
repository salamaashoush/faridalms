import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { LTI_CLAIM, LTI_ROLES } from "@faridalms/domain/lti";
import { describe, expect, test } from "bun:test";
import { createLocalJWKSet, jwtVerify } from "jose";

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
});
