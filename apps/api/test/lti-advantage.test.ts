import { plainContent } from "@faridalms/domain/content-conversion";
import {
  LTI_AGS_CLAIM,
  LTI_AGS_SCOPES,
  LTI_CLAIM,
  LTI_CONTEXT_ROLES,
  LTI_NRPS_CLAIM,
  LTI_NRPS_SCOPE,
  LTI_PLATFORM_CONFIGURATION,
  LTI_ROLES,
  LTI_TOOL_CONFIGURATION,
} from "@faridalms/domain/lti";
import { describe, expect, spyOn, test } from "bun:test";
import { decodeJwt, exportJWK, generateKeyPair } from "jose";

import { login, raw, rejection, sessionFor, signedIn } from "./harness";
import {
  askToken,
  assertion,
  launchToken,
  lessonWithLink,
  local,
  posted,
  TOOL,
} from "./lti-helpers";

/** Answers fetches for the key sets named, as a tool's site publishes them. */
function publishing(published: Map<string, unknown>) {
  return spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: string | URL | Request) => {
        const keys = published.get(
          input instanceof Request ? input.url : input.toString(),
        );
        return keys ? Response.json(keys) : Response.json({}, { status: 404 });
      },
      { preconnect: () => undefined },
    ),
  );
}

/** A tool's key pair, with the set it publishes it in. */
async function toolKeyPair(kid: string) {
  const pair = await generateKeyPair("RS256");
  return {
    pair,
    published: { keys: [{ ...(await exportJWK(pair.publicKey)), kid }] },
  };
}

/** A token for the scopes named, asked for as the tool would. */
async function tokenFor(
  clientId: string,
  key: CryptoKey,
  kid: string,
  scope: string,
) {
  const answer = await askToken(await assertion(clientId, key, kid), scope);
  return (await answer.json()) as { access_token?: string; scope?: string };
}

const MEMBERSHIPS = "application/vnd.ims.lti-nrps.v2.membershipcontainer+json";

interface Membership {
  id: string;
  context: { id: string; title: string };
  members: {
    status: string;
    user_id: string;
    roles: string[];
    name?: string;
    message?: Record<string, unknown>[];
  }[];
}

/** A tool's registration, as LTI Dynamic Registration sends it. */
const request = (overrides: Record<string, unknown> = {}) => ({
  application_type: "web",
  grant_types: ["implicit", "client_credentials"],
  response_types: ["id_token"],
  initiate_login_uri: "https://garden.example.org/lti/login",
  redirect_uris: ["https://garden.example.org/lti/launch"],
  client_name: "Virtual garden",
  jwks_uri: "https://keys.example.net/garden/jwks",
  token_endpoint_auth_method: "private_key_jwt",
  scope: `${LTI_AGS_SCOPES.score} ${LTI_NRPS_SCOPE}`,
  logo_uri: "https://garden.example.org/logo.png",
  policy_uri: "https://garden.example.org/privacy",
  [LTI_TOOL_CONFIGURATION]: {
    domain: "garden.example.org",
    target_link_uri: "https://garden.example.org/lti/launch",
    custom_parameters: { garden: "school" },
    description: "Tend a garden to learn botany.",
    claims: ["iss", "sub", "name"],
    messages: [
      {
        type: "LtiDeepLinkingRequest",
        target_link_uri: "https://garden.example.org/lti/pick",
      },
    ],
  },
  ...overrides,
});

/** Posts a registration with the token the school gave. */
const register = (body: unknown, bearer: string) =>
  raw("northwind", bearer, "/lti/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("LTI Advantage on the school's side", () => {
  test("a tool reads the class list of a course it was launched in, as far as the school allows", async () => {
    const office = await signedIn("northwind", login("principal"));
    const fields = {
      loginUrl: `${TOOL}/login`,
      launchUrl: `${TOOL}/launch`,
      redirectUrls: [`${TOOL}/launch`],
      jwksUrl: `${TOOL}/roster/jwks`,
      sendNames: false,
    };
    const registered = await office.lti.saveTool({
      name: "Class list reader",
      ...fields,
    });
    const find = async () => {
      const found = (await office.lti.tools()).tools.find(
        (row) => row.id === registered.id,
      );
      if (!found) throw new Error("tool not registered");
      return found;
    };
    const tool = await find();
    expect(tool).toMatchObject({
      grades: true,
      roster: false,
      state: "active",
    });
    const { keeper, lessonId, linkId, moduleId } = await lessonWithLink(
      tool.id,
    );
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const teacher = await keeper.api.identity.currentUser();
    const start = `/lti/launch?host=lesson&id=${lessonId}&link=${linkId}`;

    // Until the school lets the tool read class lists, no launch names one.
    const without = decodeJwt(
      await launchToken(pupil.token, me.id, tool.clientId, start),
    );
    expect(without[LTI_NRPS_CLAIM]).toBeUndefined();
    expect(without[LTI_AGS_CLAIM]).toBeDefined();
    await office.lti.saveTool({
      id: tool.id,
      expectedVersion: tool.version,
      name: tool.name,
      ...fields,
      roster: true,
    });

    // Shown in the page, the launch says so.
    const claims = decodeJwt(
      await launchToken(pupil.token, me.id, tool.clientId, `${start}&frame=1`),
    );
    expect(claims[LTI_CLAIM.launchPresentation]).toMatchObject({
      document_target: "iframe",
    });
    const service = claims[LTI_NRPS_CLAIM] as {
      context_memberships_url: string;
      service_versions: string[];
    };
    expect(service.service_versions).toEqual(["2.0"]);
    expect(service.context_memberships_url).toMatch(
      new RegExp(
        `^https://localhost/lti/nrps/module/${moduleId}/[\\w-]+/memberships$`,
      ),
    );
    const url = service.context_memberships_url;

    // A frame's trip through the tool comes back without the session cookie
    // a cross-site frame loses: the launch made at its start is taken once.
    const ask = (hint: string, loginHint = me.id) =>
      raw(
        "northwind",
        "",
        `/lti/auth?${new URLSearchParams({
          scope: "openid",
          response_type: "id_token",
          response_mode: "form_post",
          prompt: "none",
          client_id: tool.clientId,
          redirect_uri: `${TOOL}/launch`,
          login_hint: loginHint,
          lti_message_hint: hint,
          nonce: "n-frame",
          state: "s-frame",
        })}`,
      );
    const framed =
      posted(
        await (await raw("northwind", pupil.token, `${start}&frame=1`)).text(),
      ).fields.lti_message_hint ?? "";
    expect(
      (await ask(framed, teacher.id).then(async (r) => posted(await r.text())))
        .fields.error,
    ).toBe("invalid_request");
    const inFrame = posted(await (await ask(framed)).text());
    expect(inFrame.fields.state).toBe("s-frame");
    expect(decodeJwt(inFrame.fields.id_token ?? "")).toMatchObject({
      sub: me.id,
      nonce: "n-frame",
      [LTI_CLAIM.launchPresentation]: { document_target: "iframe" },
      [LTI_CLAIM.resourceLink]: { id: `${lessonId}:${linkId}` },
    });
    expect(posted(await (await ask(framed)).text()).fields.error).toBe(
      "invalid_request",
    );
    // A launch in a window still needs the person signed in at the end.
    const windowed =
      posted(await (await raw("northwind", pupil.token, start)).text()).fields
        .lti_message_hint ?? "";
    expect(posted(await (await ask(windowed)).text()).fields.error).toBe(
      "login_required",
    );

    const own = await toolKeyPair("r-1");
    const stranger = await toolKeyPair("s-1");
    const other = await office.lti.saveTool({
      name: "Stranger",
      ...fields,
      jwksUrl: `${TOOL}/stranger/jwks`,
      roster: true,
    });
    const otherTool = (await office.lti.tools()).tools.find(
      (row) => row.id === other.id,
    );
    if (!otherTool) throw new Error("tool not registered");
    const fetched = publishing(
      new Map([
        [`${TOOL}/roster/jwks`, own.published],
        [`${TOOL}/stranger/jwks`, stranger.published],
      ]),
    );
    try {
      const granted = await tokenFor(
        tool.clientId,
        own.pair.privateKey,
        "r-1",
        `${LTI_NRPS_SCOPE} ${LTI_AGS_SCOPES.score}`,
      );
      expect(granted.scope).toBe(`${LTI_NRPS_SCOPE} ${LTI_AGS_SCOPES.score}`);
      const access = granted.access_token ?? "";
      const read = (path: string, token = access) =>
        raw("northwind", token, local(path));

      const whole = await read(url);
      expect(whole.status).toBe(200);
      expect(whole.headers.get("content-type")).toBe(MEMBERSHIPS);
      const list = (await whole.json()) as Membership;
      expect(list.id).toBe(url);
      expect(list.context.id).toBe(moduleId);
      expect(list.members).toContainEqual({
        status: "Active",
        user_id: me.id,
        roles: [LTI_CONTEXT_ROLES.Learner],
      });
      expect(
        list.members.find((member) => member.user_id === teacher.id)?.roles,
      ).toEqual([LTI_CONTEXT_ROLES.Instructor]);
      // Without names for the tool, it gets ids and roles alone.
      expect(list.members.some((member) => "name" in member)).toBe(false);

      // A role by its short name or in full, and one nobody holds.
      const learners = (await (
        await read(`${url}?role=Learner`)
      ).json()) as Membership;
      expect(
        learners.members.every((member) =>
          member.roles.includes(LTI_CONTEXT_ROLES.Learner),
        ),
      ).toBe(true);
      const instructors = (await (
        await read(
          `${url}?role=${encodeURIComponent(LTI_CONTEXT_ROLES.Instructor)}`,
        )
      ).json()) as Membership;
      expect(instructors.members.map((member) => member.user_id)).toContain(
        teacher.id,
      );
      expect(
        ((await (await read(`${url}?role=Mentor`)).json()) as Membership)
          .members,
      ).toEqual([]);

      // A page at a time, the next one linked.
      const first = await read(`${url}?limit=1`);
      const next = /<([^>]+)>; rel="next"/.exec(
        first.headers.get("link") ?? "",
      )?.[1];
      expect(next).toBeTruthy();
      const second = (await (await read(next ?? "")).json()) as Membership;
      expect(second.members[0]?.user_id).not.toBe(
        ((await first.json()) as Membership).members[0]?.user_id,
      );

      // About one of its links, each member comes with that link's message.
      const linked = (await (
        await read(`${url}?rlid=${lessonId}:${linkId}`)
      ).json()) as Membership;
      expect(
        linked.members.find((member) => member.user_id === me.id)?.message,
      ).toEqual([
        {
          [LTI_CLAIM.messageType]: "LtiResourceLinkRequest",
          [LTI_CLAIM.custom]: { level: "2" },
        },
      ]);
      expect(
        (await read(`${url}?rlid=${lessonId}:${crypto.randomUUID()}`)).status,
      ).toBe(403);

      // Names go only when the school sends names to the tool.
      await office.lti.saveTool({
        id: tool.id,
        expectedVersion: (await find()).version,
        name: tool.name,
        ...fields,
        sendNames: true,
        roster: true,
      });
      const named = (await (await read(url)).json()) as Membership;
      expect(
        named.members.find((member) => member.user_id === me.id)?.name,
      ).toBeTruthy();

      // No token, a token without the scope, a course address never given,
      // or another tool's token reach nothing.
      expect((await read(url, "")).status).toBe(401);
      const gradesOnly = await tokenFor(
        tool.clientId,
        own.pair.privateKey,
        "r-1",
        LTI_AGS_SCOPES.score,
      );
      expect((await read(url, gradesOnly.access_token)).status).toBe(403);
      expect(
        (
          await read(
            url.replace(/\/[\w-]+\/memberships$/, "/forged/memberships"),
          )
        ).status,
      ).toBe(404);
      const theirs = await tokenFor(
        otherTool.clientId,
        stranger.pair.privateKey,
        "s-1",
        LTI_NRPS_SCOPE,
      );
      expect((await read(url, theirs.access_token)).status).toBe(404);
      expect(
        (await raw("northwind", access, local(url), { method: "POST" })).status,
      ).toBe(405);

      // Once the school takes the class list back, the token reads nothing.
      await office.lti.saveTool({
        id: tool.id,
        expectedVersion: (await find()).version,
        name: tool.name,
        ...fields,
        roster: false,
      });
      expect((await read(url)).status).toBe(403);
      // Nor is the tool given a token for the class list again.
      expect(
        await (
          await askToken(
            await assertion(tool.clientId, own.pair.privateKey, "r-1"),
            LTI_NRPS_SCOPE,
          )
        ).json(),
      ).toEqual({ error: "invalid_scope" });
    } finally {
      fetched.mockRestore();
    }
  });

  test("a teacher launches from a tool's score to the work behind it, and sees the column in the gradebook", async () => {
    const office = await signedIn("northwind", login("principal"));
    const registered = await office.lti.saveTool({
      name: "Essay checker",
      loginUrl: `${TOOL}/login`,
      launchUrl: `${TOOL}/launch`,
      redirectUrls: [`${TOOL}/launch`],
      jwksUrl: `${TOOL}/essays/jwks`,
      reviewUrl: `${TOOL}/review`,
      sendNames: false,
    });
    const tool = (await office.lti.tools()).tools.find(
      (row) => row.id === registered.id,
    );
    if (!tool) throw new Error("tool not registered");
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const teacherMe = await teacher.api.identity.currentUser();
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const { classes } = await teacher.api.coursework.options();
    let classId = "";
    let classmate = "";
    for (const row of classes.filter(
      (item) => item.classType === "scheduled",
    )) {
      const { roster } = await teacher.api.coursework.groups({
        classId: row.id,
      });
      if (roster.some((student) => student.id === me.id)) {
        classId ||= row.id;
        classmate ||= roster.find((student) => student.id !== me.id)?.id ?? "";
      }
    }
    const linkId = crypto.randomUUID();
    const brief = plainContent("Write about the flood.");
    brief.root.children = [
      ...(brief.root.children ?? []),
      {
        type: "lti",
        version: 1,
        lti: {
          linkId,
          toolId: tool.id,
          title: "Flood essay",
          custom: { essay: "flood" },
          lineItem: {
            label: "Flood essay",
            scoreMaximum: 20,
            submissionReview: {
              label: "Open the essay",
              custom: { view: "work" },
            },
          },
        },
      },
    ];
    const saved = await teacher.api.coursework.save({
      classId,
      title: "The flood in words",
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
    const endpoint = decodeJwt(
      await launchToken(
        pupil.token,
        me.id,
        tool.clientId,
        `/lti/launch?host=assignment&id=${saved.id}&link=${linkId}`,
      ),
    )[LTI_AGS_CLAIM] as { lineitem: string };
    const lineItemId = endpoint.lineitem.split("/").at(-1) ?? "";

    const { pair, published } = await toolKeyPair("e-1");
    const fetched = publishing(new Map([[`${TOOL}/essays/jwks`, published]]));
    try {
      const { access_token: access = "" } = await tokenFor(
        tool.clientId,
        pair.privateKey,
        "e-1",
        `${LTI_AGS_SCOPES.score} ${LTI_AGS_SCOPES.lineItem}`,
      );
      // The column says the tool can show the work behind its scores.
      expect(
        await (await raw("northwind", access, local(endpoint.lineitem))).json(),
      ).toMatchObject({
        submissionReview: { label: "Open the essay", custom: { view: "work" } },
      });
      const scored = await raw(
        "northwind",
        access,
        `${local(endpoint.lineitem)}/scores`,
        {
          method: "POST",
          headers: { "content-type": "application/vnd.ims.lis.v1.score+json" },
          body: JSON.stringify({
            userId: me.id,
            scoreGiven: 15,
            scoreMaximum: 20,
            activityProgress: "Submitted",
            gradingProgress: "PendingManual",
            timestamp: new Date().toISOString(),
          }),
        },
      );
      expect(scored.status).toBe(204);
    } finally {
      fetched.mockRestore();
    }

    const sheet = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(sheet.toolScores).toMatchObject([
      { lineItemId, reviewable: true, gradingProgress: "PendingManual" },
    ]);

    // The class gradebook shows the tool's column, with the student's score.
    const book = await teacher.api.gradebook.classBook({ classId });
    expect(book.tools).toContainEqual(
      expect.objectContaining({
        id: lineItemId,
        label: "Flood essay",
        toolName: "Essay checker",
        scoreMaximum: 20,
        assignmentId: saved.id,
      }),
    );
    expect(book.toolScores).toContainEqual({
      lineItemId,
      studentId: me.id,
      result: 15,
      gradingProgress: "PendingManual",
    });

    const review = `/lti/review?item=${lineItemId}&student=${me.id}`;
    const login1 = posted(
      await (await raw("northwind", teacher.token, review)).text(),
    );
    expect(login1.action).toBe(`${TOOL}/login`);
    expect(login1.fields.target_link_uri).toBe(`${TOOL}/review`);
    const claims = decodeJwt(
      await launchToken(teacher.token, teacherMe.id, tool.clientId, review),
    );
    expect(claims).toMatchObject({
      sub: teacherMe.id,
      [LTI_CLAIM.messageType]: "LtiSubmissionReviewRequest",
      [LTI_CLAIM.targetLinkUri]: `${TOOL}/review`,
      [LTI_CLAIM.roles]: [...LTI_ROLES.instructor],
      [LTI_CLAIM.forUser]: {
        user_id: me.id,
        roles: [...LTI_ROLES.learner],
      },
      [LTI_CLAIM.resourceLink]: {
        id: `${saved.id}:${linkId}`,
        title: "Flood essay",
      },
      [LTI_CLAIM.custom]: { essay: "flood", view: "work" },
      [LTI_AGS_CLAIM]: { lineitem: endpoint.lineitem },
    });
    expect(
      (claims[LTI_CLAIM.launchPresentation] as { return_url: string })
        .return_url,
    ).toBe(
      `https://localhost/grading?assignmentId=${saved.id}&studentId=${me.id}`,
    );
    // Without names for the tool, the student is named by id alone.
    expect(
      (claims[LTI_CLAIM.forUser] as Record<string, unknown>).name,
    ).toBeUndefined();

    // The student cannot review, nor a teacher where the tool has said
    // nothing of a student's work, nor anyone a column the tool cannot show.
    expect((await raw("northwind", pupil.token, review)).status).toBe(404);
    if (classmate)
      expect(
        (
          await raw(
            "northwind",
            teacher.token,
            `/lti/review?item=${lineItemId}&student=${classmate}`,
          )
        ).status,
      ).toBe(404);
    const elsewhere = await sessionFor("northwind", login("teacher", 0, 0));
    const reaches = (await elsewhere.api.coursework.options()).classes.some(
      (row) => row.id === classId,
    );
    if (!reaches)
      expect((await raw("northwind", elsewhere.token, review)).status).toBe(
        404,
      );
  });

  test("a tool registers itself from one address, and waits for the school before it is used", async () => {
    const office = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        (await signedIn("northwind", login("teacher"))).lti.startRegistration({
          url: `${TOOL}/register`,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    const begin = async () => {
      const { url } = await office.lti.startRegistration({
        url: `${TOOL}/register?school=northwind`,
      });
      const address = new URL(url);
      expect(address.origin + address.pathname).toBe(`${TOOL}/register`);
      expect(address.searchParams.get("school")).toBe("northwind");
      return {
        configuration: address.searchParams.get("openid_configuration") ?? "",
        token: address.searchParams.get("registration_token") ?? "",
      };
    };
    const { configuration, token } = await begin();
    expect(configuration).toBe("https://localhost/lti/openid-configuration");

    // What the school says of itself is open to the tool, signed in or not.
    const described = (await (
      await raw("northwind", "", local(configuration))
    ).json()) as Record<string, unknown>;
    expect(described).toMatchObject({
      issuer: "https://localhost/lti",
      registration_endpoint: "https://localhost/lti/register",
      token_endpoint: "https://localhost/lti/token",
      jwks_uri: "https://localhost/lti/jwks",
      authorization_endpoint: "https://localhost/lti/auth",
      token_endpoint_auth_methods_supported: ["private_key_jwt"],
      id_token_signing_alg_values_supported: ["RS256"],
      response_types_supported: ["id_token"],
    });
    expect(described.scopes_supported).toContain("openid");
    expect(described.scopes_supported).toContain(LTI_NRPS_SCOPE);
    expect(
      (
        described[LTI_PLATFORM_CONFIGURATION] as {
          messages_supported: { type: string }[];
        }
      ).messages_supported.map((message) => message.type),
    ).toEqual([
      "LtiResourceLinkRequest",
      "LtiDeepLinkingRequest",
      "LtiSubmissionReviewRequest",
    ]);
    // The configuration's address lies under the issuer, as tools check.
    expect(configuration.startsWith(`${described.issuer as string}/`)).toBe(
      true,
    );

    // A registration that points launches outside its own domain is
    // refused, as is one that does not sign with its own keys.
    expect(
      await (
        await register(
          request({
            redirect_uris: ["https://elsewhere.example.com/launch"],
          }),
          (await begin()).token,
        )
      ).json(),
    ).toEqual({ error: "invalid_redirect_uri" });
    expect(
      await (
        await register(
          request({ token_endpoint_auth_method: "client_secret_basic" }),
          (await begin()).token,
        )
      ).json(),
    ).toEqual({ error: "invalid_client_metadata" });
    // Without the school's token, or with another school's, nothing is kept.
    expect((await register(request(), "")).status).toBe(401);
    expect((await register(request(), "forged.token")).status).toBe(401);
    const east = await signedIn("northwind-east", login("principal", 0, 1));
    const eastToken = new URL(
      (await east.lti.startRegistration({ url: `${TOOL}/register` })).url,
    ).searchParams.get("registration_token");
    expect((await register(request(), eastToken ?? "")).status).toBe(401);

    const made = await register(request(), token);
    expect(made.status).toBe(201);
    const answer = (await made.json()) as Record<string, unknown>;
    expect(answer).toMatchObject({
      client_name: "Virtual garden",
      initiate_login_uri: "https://garden.example.org/lti/login",
      token_endpoint_auth_method: "private_key_jwt",
      scope: Object.values(LTI_AGS_SCOPES).join(" "),
    });
    const clientId = answer.client_id as string;
    expect(
      (answer[LTI_TOOL_CONFIGURATION] as { deployment_id: string })
        .deployment_id,
    ).toBeTruthy();
    // The token registers one tool, once.
    expect((await register(request(), token)).status).toBe(401);

    const waiting = (await office.lti.tools()).tools.find(
      (row) => row.clientId === clientId,
    );
    expect(waiting).toMatchObject({
      name: "Virtual garden",
      state: "pending",
      deepLinkUrl: "https://garden.example.org/lti/pick",
      grades: true,
      roster: false,
      sendNames: false,
      custom: { garden: "school" },
      registration: {
        domain: "garden.example.org",
        description: "Tend a garden to learn botany.",
        asked: { grades: true, roster: true },
        claims: ["iss", "sub", "name"],
      },
    });
    if (!waiting) throw new Error("registration not kept");
    // Waiting, it is offered to no teacher and given no token.
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      (await teacher.lti.available()).some((row) => row.id === waiting.id),
    ).toBe(false);
    const { pair, published } = await toolKeyPair("g-1");
    const fetched = publishing(
      new Map([["https://keys.example.net/garden/jwks", published]]),
    );
    try {
      const early = await askToken(
        await assertion(clientId, pair.privateKey, "g-1"),
        LTI_AGS_SCOPES.score,
      );
      expect(early.status).toBe(401);

      // The school looks, grants the class list it asked for, and puts it to use.
      const reviewed = await office.lti.saveTool({
        id: waiting.id,
        expectedVersion: waiting.version,
        name: waiting.name,
        loginUrl: waiting.loginUrl,
        launchUrl: waiting.launchUrl,
        redirectUrls: waiting.redirectUrls,
        jwksUrl: waiting.jwksUrl,
        deepLinkUrl: waiting.deepLinkUrl ?? "",
        sendNames: false,
        grades: true,
        roster: true,
        custom: waiting.custom,
      });
      expect(
        await rejection(
          office.lti.activateTool({
            id: waiting.id,
            expectedVersion: waiting.version,
          }),
        ),
      ).toMatchObject({ code: "CONFLICT" });
      await office.lti.activateTool({
        id: waiting.id,
        expectedVersion: reviewed.version,
      });
      expect(
        (await teacher.lti.available()).some((row) => row.id === waiting.id),
      ).toBe(true);
      const granted = await tokenFor(
        clientId,
        pair.privateKey,
        "g-1",
        `${LTI_AGS_SCOPES.score} ${LTI_NRPS_SCOPE}`,
      );
      expect(granted.scope).toBe(`${LTI_AGS_SCOPES.score} ${LTI_NRPS_SCOPE}`);
    } finally {
      fetched.mockRestore();
    }
  });
});
