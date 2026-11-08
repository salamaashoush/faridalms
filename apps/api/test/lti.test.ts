import { plainContent } from "@faridalms/domain/content-conversion";
import {
  LTI_AGS_CLAIM,
  LTI_AGS_SCOPES,
  LTI_CLAIM,
  LTI_DL_CLAIM,
  LTI_ROLES,
  LTI_VERSION,
} from "@faridalms/domain/lti";
import { describe, expect, spyOn, test } from "bun:test";
import {
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from "jose";

import { login, raw, rejection, sessionFor, signedIn } from "./harness";
import {
  askToken,
  assertion,
  handed,
  launchToken,
  lessonWithLink,
  local,
  posted,
  returned,
  TOOL,
} from "./lti-helpers";

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
    const keys = await (
      await raw("northwind", pupil.token, "/lti/jwks")
    ).json();
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
    const keys = await (
      await raw("northwind", keeper.token, "/lti/jwks")
    ).json();
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
        accept_types: ["ltiResourceLink", "link", "html"],
        accept_presentation_document_targets: ["iframe", "window", "embed"],
        accept_multiple: true,
        accept_lineitem: true,
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
        items: [
          {
            type: "lti",
            pick: {
              title: "Rivers in flood",
              url: `${TOOL}/sims/flood`,
              custom: { sim: "flood" },
              lineItem: { label: "Rivers in flood", scoreMaximum: 10 },
            },
          },
        ],
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
      ).toEqual({ pickId, items: [] });
      // Several items come at once, each placed as the editor places it:
      // a link shown in the page, an address, the tool's HTML to read as a
      // paste is. What cannot be placed is left out and the teacher told.
      const several = await returned(
        await response({
          [LTI_DL_CLAIM.contentItems]: [
            {
              type: "ltiResourceLink",
              title: "Tides",
              url: `${TOOL}/sims/tides`,
              iframe: { width: 800, height: 5000 },
              lineItem: {
                scoreMaximum: 5,
                submissionReview: { label: "See the work" },
              },
            },
            {
              type: "link",
              url: "https://example.com/rivers",
              title: "Rivers of the world",
              iframe: { src: "https://example.com/rivers?embed=1" },
            },
            { type: "html", html: "<p>A river <b>floods</b>.</p>" },
            { type: "file", url: `${TOOL}/files/1.pdf` },
            { type: "link", url: "http://example.com/plain" },
          ],
        }),
      );
      const page = await several.text();
      expect(handed(page)).toEqual({
        pickId,
        items: [
          {
            type: "lti",
            pick: {
              title: "Tides",
              url: `${TOOL}/sims/tides`,
              lineItem: {
                label: "Tides",
                scoreMaximum: 5,
                submissionReview: { label: "See the work" },
              },
              frame: { height: 2000 },
            },
          },
          {
            type: "link",
            url: "https://example.com/rivers",
            title: "Rivers of the world",
            frame: "https://example.com/rivers?embed=1",
          },
          { type: "html", html: "<p>A river <b>floods</b>.</p>", title: "" },
        ],
      });
      expect(page).toContain("Some of what you picked could not be placed.");
      expect(page).not.toContain("window.close()");
    } finally {
      fetched.mockRestore();
    }
  });

  test("a tool reports a student's score into its link's column, and reads it back", async () => {
    const office = await signedIn("northwind", login("principal"));
    const register = (name: string, jwks: string) =>
      office.lti.saveTool({
        name,
        loginUrl: `${TOOL}/login`,
        launchUrl: `${TOOL}/launch`,
        redirectUrls: [`${TOOL}/launch`],
        jwksUrl: jwks,
        sendNames: false,
      });
    const registered = await register("Quiz maker", `${TOOL}/grades/jwks`);
    const stranger = await register("Other maker", `${TOOL}/other/jwks`);
    const { tools, platform } = await office.lti.tools();
    const tool = tools.find((row) => row.id === registered.id);
    const other = tools.find((row) => row.id === stranger.id);
    if (!tool || !other) throw new Error("tools not registered");
    expect(platform.tokenUrl).toBe("https://localhost/lti/token");
    const { keeper, lessonId, linkId, moduleId, classIds } =
      await lessonWithLink(tool.id, {
        lineItem: { label: "Flood quiz", scoreMaximum: 10, tag: "grade" },
      });
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const start = `/lti/launch?host=lesson&id=${lessonId}&link=${linkId}`;
    const claims = decodeJwt(
      await launchToken(pupil.token, me.id, tool.clientId, start),
    );
    const endpoint = claims[LTI_AGS_CLAIM] as {
      scope: string[];
      lineitems: string;
      lineitem: string;
    };
    expect(endpoint.scope).toEqual(Object.values(LTI_AGS_SCOPES));
    expect(endpoint.lineitems).toMatch(
      /^https:\/\/localhost\/lti\/ags\/module\/[0-9a-f-]{36}\/[\w-]+\/lineitems$/,
    );
    // A second launch finds the column the first one made.
    const again = decodeJwt(
      await launchToken(pupil.token, me.id, tool.clientId, start),
    );
    expect((again[LTI_AGS_CLAIM] as { lineitem: string }).lineitem).toBe(
      endpoint.lineitem,
    );

    const pair = await generateKeyPair("RS256");
    const otherPair = await generateKeyPair("RS256");
    const published = new Map([
      [
        `${TOOL}/grades/jwks`,
        { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "q-1" }] },
      ],
      [
        `${TOOL}/other/jwks`,
        { keys: [{ ...(await exportJWK(otherPair.publicKey)), kid: "o-1" }] },
      ],
    ]);
    const fetched = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: string | URL | Request) => {
          const keys = published.get(
            input instanceof Request ? input.url : input.toString(),
          );
          return keys
            ? Response.json(keys)
            : Response.json({}, { status: 404 });
        },
        { preconnect: () => undefined },
      ),
    );
    try {
      const everything = Object.values(LTI_AGS_SCOPES).join(" ");
      const signedIn1 = await assertion(tool.clientId, pair.privateKey, "q-1");
      const granted = (await (
        await askToken(signedIn1, everything)
      ).json()) as {
        access_token: string;
        token_type: string;
        scope: string;
      };
      expect(granted.token_type).toBe("Bearer");
      expect(granted.scope).toBe(everything);
      const access = granted.access_token;
      // An assertion is taken once, and only for this school's token address.
      expect((await askToken(signedIn1, everything)).status).toBe(401);
      expect(
        (
          await askToken(
            await assertion(
              tool.clientId,
              pair.privateKey,
              "q-1",
              "https://localhost/lti/auth",
            ),
            everything,
          )
        ).status,
      ).toBe(401);
      expect(
        await (
          await askToken(
            await assertion(tool.clientId, pair.privateKey, "q-1"),
            "https://example.com/scope",
          )
        ).json(),
      ).toEqual({ error: "invalid_scope" });

      const call = (
        path: string,
        init: RequestInit = {},
        token: string = access,
      ) => raw("northwind", token, local(path), init);
      expect((await call(endpoint.lineitem, {}, "")).status).toBe(401);
      expect(await (await call(endpoint.lineitem)).json()).toMatchObject({
        id: endpoint.lineitem,
        label: "Flood quiz",
        scoreMaximum: 10,
        tag: "grade",
        resourceLinkId: `${lessonId}:${linkId}`,
      });
      const listed = (await (
        await call(
          `${endpoint.lineitems}?resource_link_id=${lessonId}:${linkId}`,
        )
      ).json()) as { id: string }[];
      expect(listed.map((row) => row.id)).toEqual([endpoint.lineitem]);

      const score = (body: Record<string, unknown>) =>
        call(`${endpoint.lineitem}/scores`, {
          method: "POST",
          headers: { "content-type": "application/vnd.ims.lis.v1.score+json" },
          body: JSON.stringify({
            userId: me.id,
            activityProgress: "Completed",
            gradingProgress: "FullyGraded",
            ...body,
          }),
        });
      const later = new Date();
      expect(
        (
          await score({
            scoreGiven: 14,
            scoreMaximum: 20,
            comment: "Good work.",
            timestamp: later.toISOString(),
          })
        ).status,
      ).toBe(204);
      // A score the tool sent earlier, arriving late, changes nothing.
      expect(
        (
          await score({
            scoreGiven: 2,
            scoreMaximum: 20,
            timestamp: new Date(later.getTime() - 60_000).toISOString(),
          })
        ).status,
      ).toBe(204);
      // Only a student of the course is scored.
      const teacher = await (
        await sessionFor("northwind", login("teacher"))
      ).api.identity.currentUser();
      expect(
        (
          await score({
            userId: teacher.id,
            scoreGiven: 1,
            scoreMaximum: 1,
            timestamp: later.toISOString(),
          })
        ).status,
      ).toBe(404);
      expect(await (await call(`${endpoint.lineitem}/results`)).json()).toEqual(
        [
          {
            id: `${endpoint.lineitem}/results/${me.id}`,
            scoreOf: endpoint.lineitem,
            userId: me.id,
            resultScore: 7,
            resultMaximum: 10,
            comment: "Good work.",
          },
        ],
      );

      // The module's teacher sees the column and the score in its progress.
      const progress = (
        await Promise.all(
          classIds.map((classId) =>
            keeper.api.learning.progress({ moduleId, classId }),
          ),
        )
      ).find((row) => row.students.some((student) => student.id === me.id));
      expect(progress?.tools).toMatchObject([
        { label: "Flood quiz", toolName: "Quiz maker", scoreMaximum: 10 },
      ]);
      expect(
        progress?.toolScores.find((row) => row.studentId === me.id),
      ).toMatchObject({ result: 7, gradingProgress: "FullyGraded" });

      // A tool makes a column of its own, and pages through them.
      const made = await call(endpoint.lineitems, {
        method: "POST",
        headers: { "content-type": "application/vnd.ims.lis.v2.lineitem+json" },
        body: JSON.stringify({
          label: "Bonus",
          scoreMaximum: 5,
          resourceId: "b-1",
        }),
      });
      expect(made.status).toBe(201);
      const first = await call(`${endpoint.lineitems}?limit=1`);
      const next = /<([^>]+)>; rel="next"/.exec(
        first.headers.get("link") ?? "",
      )?.[1];
      expect(next).toBeTruthy();
      expect(
        ((await (await call(next ?? "")).json()) as { label: string }[]).map(
          (row) => row.label,
        ),
      ).toEqual(["Bonus"]);
      // A course address the school never gave, or another tool, reaches nothing.
      expect(
        (
          await call(
            endpoint.lineitems.replace(
              /\/[\w-]+\/lineitems$/,
              "/forged/lineitems",
            ),
          )
        ).status,
      ).toBe(404);
      const otherAccess = (
        (await (
          await askToken(
            await assertion(other.clientId, otherPair.privateKey, "o-1"),
            everything,
          )
        ).json()) as { access_token: string }
      ).access_token;
      expect((await call(endpoint.lineitem, {}, otherAccess)).status).toBe(404);
    } finally {
      fetched.mockRestore();
    }
  });

  test("a teacher marking a brief sees what its tool scored the student", async () => {
    const office = await signedIn("northwind", login("principal"));
    const registered = await office.lti.saveTool({
      name: "Lab bench",
      loginUrl: `${TOOL}/login`,
      launchUrl: `${TOOL}/launch`,
      redirectUrls: [`${TOOL}/launch`],
      jwksUrl: `${TOOL}/bench/jwks`,
      sendNames: false,
    });
    const tool = (await office.lti.tools()).tools.find(
      (row) => row.id === registered.id,
    );
    if (!tool) throw new Error("tool not registered");
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const { classes } = await teacher.api.coursework.options();
    let classId = "";
    for (const row of classes.filter(
      (item) => item.classType === "scheduled",
    )) {
      const { roster } = await teacher.api.coursework.groups({
        classId: row.id,
      });
      if (roster.some((student) => student.id === me.id)) classId ||= row.id;
    }
    const linkId = crypto.randomUUID();
    const brief = plainContent("Measure how fast the water rises.");
    brief.root.children = [
      ...(brief.root.children ?? []),
      {
        type: "lti",
        version: 1,
        lti: {
          linkId,
          toolId: tool.id,
          title: "Rising water",
          lineItem: { label: "Rising water", scoreMaximum: 10 },
        },
      },
    ];
    const saved = await teacher.api.coursework.save({
      classId,
      title: "Water on the bench",
      brief,
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "online",
      points: 20,
      rubric: null,
    });
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const claims = decodeJwt(
      await launchToken(
        pupil.token,
        me.id,
        tool.clientId,
        `/lti/launch?host=assignment&id=${saved.id}&link=${linkId}`,
      ),
    );
    const endpoint = claims[LTI_AGS_CLAIM] as {
      lineitems: string;
      lineitem: string;
    };
    expect(endpoint.lineitems).toContain(`/ags/class/${classId}/`);

    const pair = await generateKeyPair("RS256");
    const keys = {
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "b-1" }],
    };
    const fetched = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: string | URL | Request) =>
          (input instanceof Request ? input.url : input.toString()) ===
          `${TOOL}/bench/jwks`
            ? Response.json(keys)
            : Response.json({}, { status: 404 }),
        { preconnect: () => undefined },
      ),
    );
    try {
      const { access_token: access } = (await (
        await askToken(
          await assertion(tool.clientId, pair.privateKey, "b-1"),
          LTI_AGS_SCOPES.score,
        )
      ).json()) as { access_token: string };
      const scored = await raw(
        "northwind",
        access,
        `${local(endpoint.lineitem)}/scores`,
        {
          method: "POST",
          headers: { "content-type": "application/vnd.ims.lis.v1.score+json" },
          body: JSON.stringify({
            userId: me.id,
            scoreGiven: 3,
            scoreMaximum: 5,
            comment: "Timed it well.",
            activityProgress: "Completed",
            gradingProgress: "FullyGraded",
            timestamp: new Date().toISOString(),
          }),
        },
      );
      expect(scored.status).toBe(204);
      // A token for scores alone reads nothing back.
      expect(
        (await raw("northwind", access, `${local(endpoint.lineitem)}/results`))
          .status,
      ).toBe(403);
    } finally {
      fetched.mockRestore();
    }

    const sheet = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(sheet.toolScores).toEqual([
      {
        lineItemId: expect.any(String),
        label: "Rising water",
        toolName: "Lab bench",
        maximum: 10,
        result: 6,
        gradingProgress: "FullyGraded",
        comment: "Timed it well.",
        reviewable: false,
      },
    ]);
  });
});
