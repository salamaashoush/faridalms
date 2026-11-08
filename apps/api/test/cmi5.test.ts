import type { Cmi5Package } from "@faridalms/domain/cmi5";

import {
  CMI5_CATEGORY,
  CMI5_EXTENSIONS,
  CMI5_MOVE_ON_CATEGORY,
  CMI5_VERBS,
  LAUNCH_DATA,
} from "@faridalms/domain/cmi5";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { describe, expect, spyOn, test } from "bun:test";
import { strToU8, zipSync } from "fflate";

import { sendTenantStatements } from "../src/xapi/sender";
import {
  DOMAINS,
  FILES_ORIGIN,
  login,
  raw,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const TITLE = "Reading stories together";
const AU = "https://publisher.example.com/au/rivers";
const manual = { redirect: "manual" } as const;

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

/** A lesson holding a course package of one unit, its zip stored with the school. */
async function lessonWithPackage() {
  const { session: teacher, classIds } = await teacherOfModule();
  const zip = zipSync({
    "cmi5.xml": strToU8("<courseStructure/>"),
    "rivers/index.html": strToU8(
      "<!doctype html><title>Rivers</title><script src='app.js'></script>",
    ),
    "rivers/app.js": strToU8("console.log('rivers')"),
  });
  const file = await teacher.api.files.initiate({
    purpose: "document_media",
    name: "rivers.zip",
    mediaType: "application/zip",
    sizeBytes: zip.byteLength,
  });
  const put = await raw(
    "northwind",
    teacher.token,
    `/v1/files/${file.id}/content`,
    { method: "PUT", body: zip },
  );
  expect(put.status).toBe(200);
  const course: Cmi5Package = {
    packageId: crypto.randomUUID(),
    courseId: "https://publisher.example.com/course/rivers",
    title: "Rivers",
    aus: [
      {
        id: AU,
        title: "Rivers",
        url: "rivers/index.html?from=package",
        moveOn: "CompletedAndPassed",
        masteryScore: 0.8,
        launchMethod: "AnyWindow",
      },
    ],
  };
  const module = await teacher.api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title: "Rivers in a package",
    summary: "",
    classIds,
    prerequisiteId: "",
    sequential: false,
  });
  const content = contentOfLesson({ version: 2, blocks: [] });
  if (!content) throw new Error("no document");
  content.root.children = [
    ...(content.root.children ?? []),
    { type: "cmi5", version: 1, fileId: file.id, cmi5: course },
  ];
  const lesson = await teacher.api.learning.saveLesson({
    id: "",
    moduleId: module.id,
    expectedVersion: 0,
    title: "Rivers, packaged",
    completion: "view",
    passScore: null,
    content,
    publish: true,
  });
  await teacher.api.learning.publishModule({
    id: module.id,
    expectedVersion: module.version,
  });
  return { lessonId: lesson.id, course, fileId: file.id };
}

const local = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

/** The record store's name, resolved as the public web would. */
const publicStore = () => Promise.resolve(["93.184.215.14"]);

describe("course packages in the cmi5 profile", () => {
  test("a student launches a unit, which reports to the school by cmi5's rules", async () => {
    const office = await signedIn("northwind", login("principal"));
    const before = await office.xapi.recordStore();
    const enabled = await office.xapi.saveRecordStoreSettings({
      expectedVersion: before.store?.version ?? 0,
      endpoint: "https://lrs.example.com/xapi",
      username: "school-key",
      secret: "s3cret",
      enabled: true,
    });
    const sent: { verb: { id: string } }[] = [];
    const fetched = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (_: string | URL | Request, init?: RequestInit) => {
          if (typeof init?.body === "string")
            sent.push(...(JSON.parse(init.body) as { verb: { id: string } }[]));
          return Response.json([]);
        },
        { preconnect: () => undefined },
      ),
    );
    try {
      const { lessonId, course, fileId } = await lessonWithPackage();
      const pupil = await sessionFor("northwind", login("student"));
      const me = await pupil.api.identity.currentUser();
      const start = `/cmi5/launch?lesson=${lessonId}&package=${course.packageId}&au=0`;
      expect(
        (await raw("northwind", pupil.token, start.replace("au=0", "au=3")))
          .status,
      ).toBe(404);
      const launched = await raw("northwind", pupil.token, start, manual);
      expect(launched.status).toBe(302);
      const target = new URL(launched.headers.get("location") ?? "");
      const home = `https://northwind.${DOMAINS.portal}`;
      expect(target.origin).toBe(FILES_ORIGIN);
      expect(target.pathname).toMatch(/^\/pkg\/[\w-]+\/rivers\/index\.html$/);
      expect(target.searchParams.get("from")).toBe("package");
      expect(target.searchParams.get("endpoint")).toBe(`${home}/cmi5/xapi/`);
      const actor = JSON.parse(target.searchParams.get("actor") ?? "{}") as {
        objectType: string;
        account: { homePage: string; name: string };
        name?: string;
      };
      // The learner is an account at the school, with no name given out.
      expect(actor).toEqual({
        objectType: "Agent",
        account: { homePage: home, name: me.id },
      });
      const registration = target.searchParams.get("registration") ?? "";
      const activityId = target.searchParams.get("activityId") ?? "";
      expect(activityId).not.toBe(AU);

      // The unit's pages come from the package, on the files host.
      const page = await seeded().filesHost(new Request(target));
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(page.headers.get("content-security-policy")).toContain(
        "connect-src 'self' https:",
      );
      const script = await seeded().filesHost(
        new Request(new URL("app.js", target)),
      );
      expect(await script.text()).toContain("rivers");
      const prefix = target.pathname.split("/rivers/")[0] ?? "";
      expect(
        (
          await seeded().filesHost(
            new Request(`${FILES_ORIGIN}${prefix}/rivers/missing.js`),
          )
        ).status,
      ).toBe(404);
      // The zip's own download link opens no page in it.
      const download = await raw(
        "northwind",
        pupil.token,
        `/v1/files/${fileId}/content`,
        manual,
      );
      const link = new URL(download.headers.get("location") ?? "");
      expect(link.pathname).toMatch(/^\/b\//);
      expect(
        (
          await seeded().filesHost(
            new Request(
              `${FILES_ORIGIN}${link.pathname.replace("/b/", "/pkg/")}/rivers/index.html`,
            ),
          )
        ).status,
      ).toBe(404);

      // The token is fetched once.
      const fetchUrl = local(target.searchParams.get("fetch") ?? "");
      const take = () => raw("northwind", "", fetchUrl, { method: "POST" });
      const token = ((await (await take()).json()) as { "auth-token": string })[
        "auth-token"
      ];
      expect(token).toBeTruthy();
      expect(await (await take()).json()).toMatchObject({ "error-code": "1" });

      const call = (
        path: string,
        init: { method?: string; body?: string; version?: string } = {},
        auth = `Basic ${token}`,
      ) =>
        seeded().handler(
          new Request(`http://api.test/cmi5/xapi/${path}`, {
            method: init.method ?? "GET",
            body: init.body,
            headers: {
              "x-farida-school": "northwind",
              "x-experience-api-version": init.version ?? "1.0.3",
              authorization: auth,
              "content-type": "application/json",
            },
          }),
        );
      const agent = encodeURIComponent(JSON.stringify(actor));
      const stateAt = (stateId: string) =>
        `activities/state?activityId=${encodeURIComponent(activityId)}&agent=${agent}&registration=${registration}&stateId=${stateId}`;
      const data = (await (await call(stateAt(LAUNCH_DATA))).json()) as {
        contextTemplate: { extensions: Record<string, string> };
        launchMode: string;
        moveOn: string;
        masteryScore: number;
      };
      expect(data).toMatchObject({
        launchMode: "Normal",
        moveOn: "CompletedAndPassed",
        masteryScore: 0.8,
      });
      const sessionId =
        data.contextTemplate.extensions[CMI5_EXTENSIONS.sessionId];
      expect(sessionId).toBeTruthy();
      // The launch data is the school's to write.
      expect(
        (await call(stateAt(LAUNCH_DATA), { method: "PUT", body: "{}" }))
          .status,
      ).toBe(403);
      // A unit keeps its own documents, merged when posted.
      expect(
        (
          await call(stateAt("bookmark"), {
            method: "PUT",
            body: JSON.stringify({ page: 2 }),
          })
        ).status,
      ).toBe(204);
      await call(stateAt("bookmark"), {
        method: "POST",
        body: JSON.stringify({ seen: true }),
      });
      expect(await (await call(stateAt("bookmark"))).json()).toEqual({
        page: 2,
        seen: true,
      });
      // Nothing without the token, the version, or for another learner.
      expect(
        (await call(stateAt("bookmark"), {}, "Basic bm9wZQ==")).status,
      ).toBe(401);
      expect(
        (
          await call(stateAt("bookmark"), {
            version: "2.0.0",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call(
            stateAt("bookmark").replace(
              agent,
              encodeURIComponent(
                JSON.stringify({
                  account: { homePage: home, name: crypto.randomUUID() },
                }),
              ),
            ),
          )
        ).status,
      ).toBe(403);
      expect(
        (await (
          await call(
            `agents/profile?agent=${agent}&profileId=cmi5LearnerPreferences`,
          )
        ).json()) as unknown,
      ).toMatchObject({ languagePreference: "en,ar" });

      const said = (
        verb: keyof typeof CMI5_VERBS,
        result?: Record<string, unknown>,
      ) => ({
        actor,
        verb: { id: CMI5_VERBS[verb] },
        object: { id: activityId },
        ...(result ? { result } : {}),
        context: {
          registration,
          contextActivities: {
            category: [
              { id: CMI5_CATEGORY },
              ...(result && ("success" in result || "completion" in result)
                ? [{ id: CMI5_MOVE_ON_CATEGORY }]
                : []),
            ],
            grouping: [{ id: AU }],
          },
          extensions: { [CMI5_EXTENSIONS.sessionId]: sessionId },
        },
      });
      const post = (body: unknown) =>
        call("statements", { method: "POST", body: JSON.stringify(body) });
      // Nothing before initialized, and a batch with a bad one keeps nothing.
      expect(
        await (
          await post(said("completed", { completion: true, duration: "PT1M" }))
        ).json(),
      ).toEqual({ error: "not_initialized" });
      expect(
        (
          await post([
            said("initialized"),
            said("passed", {
              score: { scaled: 0.5 },
              success: true,
              duration: "PT2M",
            }),
          ])
        ).status,
      ).toBe(400);
      const ids = (await (
        await post([
          said("initialized"),
          said("passed", {
            score: { scaled: 0.9 },
            success: true,
            duration: "PT2M",
          }),
        ])
      ).json()) as string[];
      expect(ids).toHaveLength(2);
      expect(
        await (
          await post(
            said("passed", {
              score: { scaled: 0.95 },
              success: true,
              duration: "PT3M",
            }),
          )
        ).json(),
      ).toEqual({ error: "repeated" });
      expect(
        (
          await post([
            said("completed", { completion: true, duration: "PT4M" }),
            said("terminated", { duration: "PT5M" }),
          ])
        ).status,
      ).toBe(200);
      expect(await (await post(said("initialized"))).json()).toEqual({
        error: "terminated",
      });

      // A second launch abandons nothing that ended, and a session still open
      // when the unit is launched again is abandoned and takes no more.
      const again = new URL(
        (await raw("northwind", pupil.token, start, manual)).headers.get(
          "location",
        ) ?? "",
      );
      const second = (
        (await (
          await raw(
            "northwind",
            "",
            local(again.searchParams.get("fetch") ?? ""),
            { method: "POST" },
          )
        ).json()) as { "auth-token": string }
      )["auth-token"];
      await raw("northwind", pupil.token, start, manual);
      expect(
        (await call(stateAt("bookmark"), {}, `Basic ${second}`)).status,
      ).toBe(403);

      await sendTenantStatements(
        seeded().cell,
        seeded().cellSecret,
        seeded().tenants[0]?.tenantId ?? "",
        publicStore,
      );
      const verbs = sent.map((statement) => statement.verb.id);
      for (const verb of [
        CMI5_VERBS.launched,
        CMI5_VERBS.initialized,
        CMI5_VERBS.passed,
        CMI5_VERBS.completed,
        CMI5_VERBS.terminated,
        CMI5_VERBS.satisfied,
        CMI5_VERBS.abandoned,
      ])
        expect(verbs).toContain(verb);
      expect(
        verbs.filter((verb) => verb === CMI5_VERBS.satisfied),
      ).toHaveLength(1);
    } finally {
      fetched.mockRestore();
      const now = await office.xapi.recordStore();
      await office.xapi.saveRecordStoreSettings({
        expectedVersion: now.store?.version ?? enabled.version,
        endpoint: "https://lrs.example.com/xapi",
        username: "school-key",
        enabled: false,
      });
    }
  });
});
