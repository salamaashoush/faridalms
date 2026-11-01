import { plainContent } from "@faridalms/domain/content-conversion";
import { expect, test } from "@playwright/test";

import { API_ORIGIN, apiAs, apiClient, signedInApi } from "./fixtures/api";
import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

const ACME_ADMIN = "principal.acme@acme.example.com";
// The seed's second teacher keeps 8A, where Yasmin Sabry sits; her mother
// signs in with her number. Yasmin is the student account, and a family's
// conversation about her is not hers to read.
const TEACHER = "teacher2.northwind@northwind.example.com";
const MOTHER = "parent1007@northwind.example.com";

const names = (given: string, family: string) => ({
  en: { given, middle: "", family },
  ar: { given: "سلامة", middle: "", family: "عشوش" },
});

async function refusal(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("The call succeeded but was expected to fail");
}

test("native clients authenticate without browser cookies and can revoke sessions", async () => {
  const api = await apiAs("admin");
  expect(await api.identity.currentUser()).toMatchObject({
    school: { slug: "northwind" },
    workspace: "admin",
  });
  await api.identity.signOut();
  expect(await refusal(api.identity.currentUser())).toMatchObject({
    code: "UNAUTHORIZED",
  });
});

test("concurrent school sessions cannot override each other's database context", async () => {
  const [northwind, acme] = await Promise.all([
    signedInApi("principal.northwind@northwind.example.com"),
    signedInApi(ACME_ADMIN, PASSWORD, "acme"),
  ]);
  const own = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      (index % 2 === 0 ? northwind.api : acme.api).identity.currentUser(),
    ),
  );
  for (const [index, me] of own.entries())
    expect(me.school.slug).toBe(index % 2 === 0 ? "northwind" : "acme");

  // A token sent to the other school's name never reads that school.
  const crossed = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      refusal(
        apiClient(
          index % 2 === 0
            ? { token: northwind.token, school: "acme" }
            : { token: acme.token, school: "northwind" },
        ).identity.currentUser(),
      ),
    ),
  );
  for (const error of crossed)
    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
});

test("parents cannot enumerate a school directory", async () => {
  const parent = await apiAs("parent");
  expect(await refusal(parent.people.students({}))).toMatchObject({
    code: "FORBIDDEN",
  });
});

test("directory pages are bounded, stable and searchable", async () => {
  const admin = await apiAs("admin");
  const first = await admin.people.students({ pageSize: 25, page: 1 });
  expect(first.rows.length).toBeLessThanOrEqual(25);
  expect(first.total).toBeGreaterThan(0);
  const again = await admin.people.students({ pageSize: 25, page: 1 });
  expect(again.rows.map((row) => row.id)).toEqual(
    first.rows.map((row) => row.id),
  );
  expect(
    await refusal(admin.people.students({ pageSize: 100000 as unknown as 25 })),
  ).toMatchObject({ code: "BAD_REQUEST" });
  expect(
    await admin.people.students({ q: "no-such-student-7f1490" }),
  ).toMatchObject({ rows: [], total: 0 });
});

test("the API exposes a machine-readable contract and request IDs", async ({
  request,
}) => {
  const response = await request.get(`${API_ORIGIN}/openapi.json`);
  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toBeTruthy();
  expect(await response.json()).toMatchObject({
    info: { title: "Farida LMS API" },
  });
});

test("administrative writes reject family accounts and cross-school references", async () => {
  const parent = await apiAs("parent");
  expect(
    await refusal(
      parent.people.saveStaff({
        names: names("Salama", "Ashoush"),
        email: `salama-${crypto.randomUUID()}@example.com`,
        roles: ["teacher"],
      }),
    ),
  ).toMatchObject({ code: "FORBIDDEN" });

  const [northwind, acme] = await Promise.all([
    apiAs("admin"),
    signedInApi(ACME_ADMIN, PASSWORD, "acme").then((session) => session.api),
  ]);
  const foreignGrade = (await acme.people.options()).grades[0];
  if (!foreignGrade) throw new Error("the seed gives acme no grades");
  const reference = `TEST-${crypto.randomUUID().slice(0, 8)}`;
  expect(
    await refusal(
      northwind.people.saveStudent({
        names: names("Salama", "Ashoush"),
        reference,
        gradeId: foreignGrade.id,
      }),
    ),
  ).toMatchObject({ code: "BAD_REQUEST" });
  expect(await northwind.people.students({ q: reference })).toMatchObject({
    rows: [],
    total: 0,
  });
});

test("a guardian is found by phone whichever way the number was written", async () => {
  const admin = await apiAs("admin");
  const options = await admin.people.options();
  const mother = options.relations.find((row) => row.code === "mother");
  if (!mother) throw new Error("the seed has no mother relation");
  const digits = String(Date.now()).slice(-7);
  const spaced = `${digits.slice(0, 3)} ${digits.slice(3)}`;
  const create = async (label: string, phone: string) => {
    const student = await admin.people.saveStudent({
      names: names("Salama", `Ashoush ${label} ${digits}`),
      reference: `PH-${label.slice(0, 3)}-${digits}`,
      guardians: [
        {
          person: { names: names("Mona", `Ashoush ${label} ${digits}`), phone },
          flags: {
            relationId: mother.id,
            legalGuardian: true,
            portalAccess: false,
            receivesNotifications: true,
            primaryContact: true,
            emergencyContact: true,
            residence: "primary",
            pickup: "allowed",
          },
        },
      ],
    });
    const record = await admin.people.student({ id: student.id });
    const guardian = record.guardians?.[0];
    if (!guardian) throw new Error("the guardian was not linked");
    return guardian.userId;
  };
  const [national, international] = await Promise.all([
    create("national", `0109 ${spaced}`),
    create("international", `+20 108 ${spaced}`),
  ]);
  const found = async (phone: string) =>
    (await admin.people.findGuardians({ phone })).map((row) => row.id);
  const [
    nationalSpaced,
    nationalPlus,
    nationalZeros,
    internationalSpaced,
    internationalBare,
  ] = await Promise.all([
    found(`+20 109 ${spaced}`),
    found(`+20109${digits}`),
    found(`0020109${digits}`),
    found(`0108 ${spaced}`),
    found(`0108${digits}`),
  ]);
  expect(nationalSpaced).toContain(national);
  expect(nationalPlus).toContain(national);
  expect(nationalZeros).toContain(national);
  expect(internationalSpaced).toContain(international);
  expect(internationalBare).toContain(international);
  expect(internationalBare).not.toContain(national);
});

test("teachers message linked families and replies stay private", async ({
  page,
  browserName,
}) => {
  const [teacher, mother, outsider] = await Promise.all([
    signedInApi(TEACHER).then((session) => session.api),
    signedInApi(MOTHER).then((session) => session.api),
    apiAs("student"),
  ]);
  const me = await mother.identity.currentUser();
  const child = (await mother.people.person({ id: me.id })).children[0];
  if (!child) throw new Error("the seed gives the mother no child");
  const note = `Salama learning steps (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  const { threadId } = await teacher.messages.start({
    kind: "family",
    studentId: child.studentId,
    recipientIds: [],
    subject: "",
    content: plainContent(note),
  });
  const reply = `Thank you, a meeting please (${crypto.randomUUID().slice(0, 6)})`;
  await mother.messages.send({
    threadId,
    content: plainContent(reply),
  });
  const thread = await teacher.messages.thread({ id: threadId });
  expect(thread.messages.map((message) => message.body)).toEqual(
    expect.arrayContaining([note, reply]),
  );

  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto(`/family/messages?thread=${threadId}`);
  await untilHydrated(page);
  const composer = page.locator("form [contenteditable=true]").last();
  await expect(composer).toBeEditable();
  const words = `Salama learning plan ${crypto.randomUUID().slice(0, 6)}`;
  await composer.click();
  await page.keyboard.type(words);
  await composer.press("ControlOrMeta+a");
  await page
    .getByRole("toolbar", { name: "Text formatting" })
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await expect(composer.locator("strong")).toHaveText(words);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const messages = page.getByRole("list", { name: "Messages" });
  await expect(messages.locator("strong", { hasText: words })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`thread=${threadId}`));
  await expect(composer).toHaveText("");
  await page.reload();
  await expect(messages.locator("strong", { hasText: words })).toBeVisible();

  expect(
    await refusal(outsider.messages.thread({ id: threadId })),
  ).toMatchObject({ code: "NOT_FOUND" });
  expect(
    await refusal(
      outsider.messages.send({
        threadId,
        content: plainContent("This is not my conversation."),
      }),
    ),
  ).toMatchObject({ code: "NOT_FOUND" });
  const reachable = await mother.messages.recipients({ q: "" });
  expect(reachable.rows.every((row) => row.kind === "staff")).toBe(true);
});

test("calendar revisions reject stale updates without losing the saved event", async () => {
  const admin = await apiAs("admin");
  const day = "2026-10-12";
  const input = {
    id: "",
    expectedVersion: 0,
    titleEn: "Salama calendar revision",
    titleAr: "",
    category: "general" as const,
    startsOn: day,
    endsOn: day,
    allDay: true,
    startTime: "",
    endTime: "",
    location: "",
    provisional: false,
    audiences: [{ scope: "staff" as const, classId: "", gradeId: "" }],
    description: plainContent("Initial details"),
  };
  const created = await admin.calendar.save(input);
  const saved = await admin.calendar.save({
    ...input,
    id: created.id,
    expectedVersion: created.version,
    titleEn: "Saved revision",
  });
  expect(saved.version).toBeGreaterThan(created.version);
  expect(
    await refusal(
      admin.calendar.save({
        ...input,
        id: created.id,
        expectedVersion: created.version,
        titleEn: "Stale revision",
      }),
    ),
  ).toMatchObject({ code: "CONFLICT" });
  const { events } = await admin.calendar.range({
    from: day,
    to: day,
    child: "",
  });
  expect(events.find((row) => row.id === created.id)?.titleEn).toBe(
    "Saved revision",
  );
});

test("shared student records protect medical fields and family class rosters", async () => {
  const [admin, parent, teacher] = await Promise.all([
    apiAs("admin"),
    apiAs("parent"),
    apiAs("teacher"),
  ]);
  const me = await parent.identity.currentUser();
  const own = new Set(
    (await parent.people.person({ id: me.id })).children.map(
      (child) => child.studentId,
    ),
  );
  expect(own.size).toBeGreaterThan(0);
  let opened = 0;
  for (const row of (await admin.classes.directory({})).rows) {
    const record = await parent.classes.record({ id: row.id }).then(
      (found) => found,
      () => null,
    );
    if (!record) continue;
    opened += 1;
    expect(record.access).toMatchObject({ manage: false, staff: false });
    expect(record.roster.length).toBeGreaterThan(0);
    expect(record.roster.every((student) => own.has(student.userId))).toBe(
      true,
    );
  }
  expect(opened).toBeGreaterThan(0);

  const homeroom = (await teacher.classes.mine({})).rows.find(
    (row) => row.classType === "homeroom",
  );
  if (!homeroom) throw new Error("the seed gives the teacher no homeroom");
  const learner = (await teacher.classes.record({ id: homeroom.id })).roster[0];
  if (!learner) throw new Error("the teacher's homeroom has no students");
  expect(await teacher.people.student({ id: learner.userId })).toMatchObject({
    access: { health: false, manage: false },
  });
  expect(
    await refusal(teacher.records.health({ studentId: learner.userId })),
  ).toMatchObject({ code: "FORBIDDEN" });
});
