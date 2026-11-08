import type { LessonBlock } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { LTI_AGS_CLAIM, LTI_AGS_SCOPES } from "@faridalms/domain/lti";
import { describe, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { decodeJwt, exportJWK, generateKeyPair } from "jose";

import { sendTenantStatements } from "../src/xapi/sender";
import {
  DOMAINS,
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";
import {
  askToken,
  assertion,
  launchToken,
  lessonWithLink,
  local,
  TOOL,
} from "./lti-helpers";

const TITLE = "Reading stories together";
const LRS = "https://lrs.example.com/xapi/";

/** A teacher of the seeded module, who may make modules for its classes. */
async function teacherOfModule() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  for (const row of tenant?.logins ?? []) {
    if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
    const session = await sessionFor("northwind", row.loginName);
    const source = (await session.api.learning.modules({})).rows.find(
      (item) => item.title === TITLE,
    );
    if (source)
      return { session, classIds: source.classes.map((item) => item.id) };
  }
  throw new Error("no teacher of the module");
}

const choice = (id: string, right: string, prompt: string): LessonBlock => ({
  id,
  points: 2,
  hints: [],
  explanation: "",
  tries: null,
  type: "choice",
  prompt,
  options: [
    { id: right, text: "Yes", feedback: "" },
    { id: crypto.randomUUID(), text: "No", feedback: "" },
  ],
  correctOptionIds: [right],
  multiple: false,
  shuffle: false,
});

type Answer = (asked: { url: string; method: string }) => Response;

/** The store's usual answer: it took what it was sent. */
const took: Answer = () => new Response(JSON.stringify([]), { status: 200 });

/** What the record store was sent, and how it answers. */
function recordStore(published: Map<string, unknown> = new Map()) {
  const calls: {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
  }[] = [];
  let answer = took;
  const fetched = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString();
        const method = init?.method ?? "GET";
        const keys = published.get(url);
        if (keys) return Response.json(keys);
        calls.push({
          url,
          method,
          headers: new Headers(init?.headers),
          body:
            typeof init?.body === "string"
              ? (JSON.parse(init.body) as unknown)
              : null,
        });
        return answer({ url, method });
      },
      { preconnect: () => undefined },
    ),
  );
  return {
    calls,
    answer: (next: Answer) => {
      answer = next;
    },
    restore: () => fetched.mockRestore(),
  };
}

const tenantId = () => seeded().tenants[0]?.tenantId ?? "";

/** One pass of the sender over the school's tenant. */
const send = () =>
  sendTenantStatements(seeded().cell, seeded().cellSecret, tenantId());

/** Makes every waiting statement due now, as time passing would. */
const dueNow = () =>
  seeded().cell.withWorker(
    {
      tenantId: tenantId(),
      requestId: crypto.randomUUID(),
      actor: { kind: "system" },
    },
    "write",
    (tx) =>
      tx.execute(sql`
        update core.xapi_statements set due_at = statement_timestamp()
        where tenant_id = ${tenantId()}::uuid and state = 'queued'`),
  );

describe("a school's learning sent to its own record store", () => {
  test("an administrator sets the store, its secret sealed and never shown", async () => {
    const office = await signedIn("northwind", login("principal"));
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.xapi.recordStore())).toMatchObject({
      code: "FORBIDDEN",
    });
    const before = await office.xapi.recordStore();
    const version = before.store?.version ?? 0;
    // Sending cannot go on without a secret, nor to an address in clear.
    if (!before.store?.secretKept)
      expect(
        await rejection(
          office.xapi.saveRecordStoreSettings({
            expectedVersion: version,
            endpoint: "https://lrs.example.com/xapi",
            username: "school-key",
            enabled: true,
          }),
        ),
      ).toMatchObject({ message: "xapi.secret_needed" });
    expect(
      await rejection(
        office.xapi.saveRecordStoreSettings({
          expectedVersion: version,
          endpoint: "http://lrs.example.com/xapi",
          username: "school-key",
          secret: "s3cret",
          enabled: true,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const saved = await office.xapi.saveRecordStoreSettings({
      expectedVersion: version,
      endpoint: "https://lrs.example.com/xapi",
      username: "school-key",
      secret: "s3cret",
      enabled: false,
    });
    const read = await office.xapi.recordStore();
    expect(read.store).toEqual({
      version: saved.version,
      endpoint: LRS,
      username: "school-key",
      secretKept: true,
      enabled: false,
    });
    expect(JSON.stringify(read)).not.toContain("s3cret");
    // Left empty, the secret kept stays; a stale version is refused.
    const kept = await office.xapi.saveRecordStoreSettings({
      expectedVersion: saved.version,
      endpoint: LRS,
      username: "school-key",
      enabled: false,
    });
    expect((await office.xapi.recordStore()).store?.secretKept).toBe(true);
    expect(
      await rejection(
        office.xapi.saveRecordStoreSettings({
          expectedVersion: saved.version,
          endpoint: LRS,
          username: "school-key",
          enabled: false,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
    expect(kept.version).toBeGreaterThan(saved.version);
  });

  test("learning goes as it happens, and the store's answers decide what is sent again", async () => {
    const office = await signedIn("northwind", login("principal"));
    const current = await office.xapi.recordStore();
    const enabled = await office.xapi.saveRecordStoreSettings({
      expectedVersion: current.store?.version ?? 0,
      endpoint: LRS,
      username: "school-key",
      secret: "s3cret",
      enabled: true,
    });
    const store = recordStore();
    try {
      const { session: keeper, classIds } = await teacherOfModule();
      const module = await keeper.api.learning.saveModule({
        id: "",
        expectedVersion: 0,
        title: "Rivers sent as they happen",
        summary: "",
        classIds,
        prerequisiteId: "",
        sequential: false,
      });
      const first = crypto.randomUUID();
      const second = crypto.randomUUID();
      const firstRight = crypto.randomUUID();
      const secondRight = crypto.randomUUID();
      const content = contentOfLesson({
        version: 2,
        blocks: [
          choice(first, firstRight, "Does the Nile flood?"),
          choice(second, secondRight, "Does the Thames flood?"),
        ],
      });
      if (!content) throw new Error("no document");
      const lesson = await keeper.api.learning.saveLesson({
        id: "",
        moduleId: module.id,
        expectedVersion: 0,
        title: "The flood",
        completion: "view",
        passScore: null,
        content,
        publish: true,
      });
      await keeper.api.learning.publishModule({
        id: module.id,
        expectedVersion: module.version,
      });
      const pupil = await sessionFor("northwind", login("student"));
      const me = await pupil.api.identity.currentUser();
      await pupil.api.learning.playLesson({ id: lesson.id });
      await pupil.api.learning.respond({
        lessonId: lesson.id,
        blockId: first,
        response: { type: "choice", optionIds: [firstRight] },
      });
      // Nothing waited on the store: the requests answered before any sending.
      expect(store.calls).toHaveLength(0);

      expect(await send()).toBeGreaterThanOrEqual(2);
      const [sent] = store.calls;
      expect(sent?.url).toBe(`${LRS}statements`);
      expect(sent?.method).toBe("POST");
      expect(sent?.headers.get("authorization")).toBe(
        `Basic ${Buffer.from("school-key:s3cret").toString("base64")}`,
      );
      expect(sent?.headers.get("x-experience-api-version")).toBe("1.0.3");
      const body = sent?.body as {
        id: string;
        actor: { account: { homePage: string; name: string } };
        verb: { id: string };
        object: { id: string };
      }[];
      const home = `https://northwind.${DOMAINS.portal}`;
      const mine = body.filter((each) => each.actor.account.name === me.id);
      expect(mine.map((each) => each.verb.id).toSorted()).toEqual([
        "http://adlnet.gov/expapi/verbs/answered",
        "http://adlnet.gov/expapi/verbs/completed",
      ]);
      expect(mine.every((each) => each.actor.account.homePage === home)).toBe(
        true,
      );
      // An answer goes by the id the module's export gives it, so a store
      // given both keeps one.
      const answered = mine.find((each) => each.verb.id.endsWith("answered"));
      let exported: { id: string; verb: { id: string } }[] = [];
      for (const classId of classIds) {
        const listed = (await (
          await raw(
            "northwind",
            keeper.token,
            `/v1/modules/${module.id}/statements.json?classId=${classId}`,
          )
        ).json()) as { id: string; verb: { id: string } }[];
        if (listed.some((each) => each.id === answered?.id)) exported = listed;
      }
      expect(exported.map((each) => each.id)).toContain(answered?.id ?? "");
      const after = await office.xapi.recordStore();
      expect(after.sending).toMatchObject({ queued: 0, failed: 0 });
      expect(after.sending.sent).toBeGreaterThanOrEqual(2);

      // A store that cannot answer now is tried again later.
      store.calls.length = 0;
      store.answer(() => new Response("", { status: 503 }));
      await pupil.api.learning.respond({
        lessonId: lesson.id,
        blockId: second,
        response: { type: "choice", optionIds: [secondRight] },
      });
      expect(await send()).toBe(0);
      const waiting = await office.xapi.recordStore();
      expect(waiting.sending).toMatchObject({
        queued: 1,
        lastError: "HTTP 503",
      });
      expect(await send()).toBe(0);
      expect(store.calls).toHaveLength(1);

      // A batch the store refuses goes again one by one; a statement it
      // has already counts as sent, one it refuses stays failed.
      await dueNow();
      store.calls.length = 0;
      store.answer(
        ({ method }) =>
          new Response("", { status: method === "POST" ? 400 : 409 }),
      );
      expect(await send()).toBe(1);
      expect(store.calls.map((call) => call.method)).toEqual(["POST", "PUT"]);
      expect(store.calls[1]?.url).toMatch(
        new RegExp(`^${LRS}statements\\?statementId=[0-9a-f-]{36}$`),
      );

      // A mark released to the student goes as a score in its class.
      const teacher = await sessionFor("northwind", login("teacher", 0, 1));
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
      const saved = await teacher.api.coursework.save({
        classId,
        title: "Floods in a paragraph",
        brief: plainContent("Write about a flood."),
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
      const drafted = await pupil.api.coursework.saveDraft({
        assignmentId: saved.id,
        expectedVersion: 0,
        content: plainContent("The river rose."),
      });
      await pupil.api.coursework.handIn({
        assignmentId: saved.id,
        expectedVersion: drafted.version,
      });
      const attempt = (
        await teacher.api.coursework.grading({
          assignmentId: saved.id,
          studentId: me.id,
        })
      ).attempts[0];
      if (!attempt) throw new Error("no attempt");
      await teacher.api.coursework.assess({ attemptId: attempt.id, score: 15 });
      // A mark kept private is not sent.
      store.calls.length = 0;
      store.answer(() => new Response("", { status: 400 }));
      expect(await send()).toBe(0);
      expect(store.calls).toHaveLength(0);
      await teacher.api.coursework.act({
        assignmentId: saved.id,
        action: "return",
        studentIds: [me.id],
      });
      expect(await send()).toBe(0);
      const scored = store.calls[0]?.body as {
        verb: { id: string };
        object: { id: string };
        result: { score: { raw: number; max: number; scaled: number } };
      }[];
      expect(scored[0]).toMatchObject({
        verb: { id: "http://adlnet.gov/expapi/verbs/scored" },
        object: { id: `${home}/assignments/${saved.id}` },
        result: { score: { raw: 15, max: 20, scaled: 0.75 } },
      });
      // Refused one by one as well, it stays failed with the store's word,
      // until the school puts it back once the store is put right.
      const failed = await office.xapi.recordStore();
      expect(failed.sending).toMatchObject({
        failed: 1,
        lastError: "HTTP 400",
      });
      expect((await office.xapi.retryRecordStore()).queued).toBe(1);
      store.answer(took);
      expect(await send()).toBe(1);
      expect((await office.xapi.recordStore()).sending.failed).toBe(0);
    } finally {
      store.restore();
      const now = await office.xapi.recordStore();
      await office.xapi.saveRecordStoreSettings({
        expectedVersion: now.store?.version ?? enabled.version,
        endpoint: LRS,
        username: "school-key",
        enabled: false,
      });
    }
  });

  test("an outside tool's score goes once the tool has marked it", async () => {
    const office = await signedIn("northwind", login("principal"));
    const registered = await office.lti.saveTool({
      name: "Flood quiz",
      loginUrl: `${TOOL}/login`,
      launchUrl: `${TOOL}/launch`,
      redirectUrls: [`${TOOL}/launch`],
      jwksUrl: `${TOOL}/xapi/jwks`,
      sendNames: false,
    });
    const tool = (await office.lti.tools()).tools.find(
      (row) => row.id === registered.id,
    );
    if (!tool) throw new Error("tool not registered");
    const { lessonId, linkId, moduleId } = await lessonWithLink(tool.id, {
      lineItem: { label: "Flood quiz", scoreMaximum: 10 },
    });
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const endpoint = decodeJwt(
      await launchToken(
        pupil.token,
        me.id,
        tool.clientId,
        `/lti/launch?host=lesson&id=${lessonId}&link=${linkId}`,
      ),
    )[LTI_AGS_CLAIM] as { lineitem: string };
    const pair = await generateKeyPair("RS256");
    const current = await office.xapi.recordStore();
    const enabled = await office.xapi.saveRecordStoreSettings({
      expectedVersion: current.store?.version ?? 0,
      endpoint: LRS,
      username: "school-key",
      secret: "s3cret",
      enabled: true,
    });
    const store = recordStore(
      new Map([
        [
          `${TOOL}/xapi/jwks`,
          { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "x-1" }] },
        ],
      ]),
    );
    try {
      const { access_token: access = "" } = (await (
        await askToken(
          await assertion(tool.clientId, pair.privateKey, "x-1"),
          LTI_AGS_SCOPES.score,
        )
      ).json()) as { access_token?: string };
      const score = (gradingProgress: string, timestamp: Date) =>
        raw("northwind", access, `${local(endpoint.lineitem)}/scores`, {
          method: "POST",
          headers: { "content-type": "application/vnd.ims.lis.v1.score+json" },
          body: JSON.stringify({
            userId: me.id,
            scoreGiven: 7,
            scoreMaximum: 10,
            activityProgress: "Completed",
            gradingProgress,
            timestamp: timestamp.toISOString(),
          }),
        });
      const marked = new Date();
      expect(
        (await score("Pending", new Date(marked.getTime() - 1000))).status,
      ).toBe(204);
      // Still marking, the tool's score is not sent.
      expect(await send()).toBe(0);
      expect((await score("FullyGraded", marked)).status).toBe(204);
      expect(await send()).toBe(1);
      const [statement] = (store.calls[0]?.body ?? []) as {
        verb: { id: string };
        object: { id: string };
        result: { score: { raw: number; max: number } };
        context: { contextActivities: { grouping: { id: string }[] } };
      }[];
      const home = `https://northwind.${DOMAINS.portal}`;
      const lineItemId = endpoint.lineitem.split("/").at(-1) ?? "";
      expect(statement).toMatchObject({
        verb: { id: "http://adlnet.gov/expapi/verbs/scored" },
        object: { id: `${home}/lti/ags/lineitems/${lineItemId}` },
        result: { score: { raw: 7, max: 10 } },
        context: {
          contextActivities: {
            grouping: [{ id: `${home}/modules/${moduleId}` }],
          },
        },
      });
    } finally {
      store.restore();
      await office.xapi.saveRecordStoreSettings({
        expectedVersion: enabled.version,
        endpoint: LRS,
        username: "school-key",
        enabled: false,
      });
    }
  });
});
