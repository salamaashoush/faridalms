import type { NewSchoolInput } from "@faridalms/domain/provisioning";

import {
  openDirectoryAdmin,
  SlugTakenError,
} from "@faridalms/database/directory/admin";
import { openDirectory } from "@faridalms/database/directory/client";
import { CAPABILITIES } from "@faridalms/domain/capabilities";
import { plainContent } from "@faridalms/domain/content-conversion";
import { MODULE_IDS, wordOn } from "@faridalms/domain/modules";
import { BASIC_ENTITLEMENTS, settableOf } from "@faridalms/domain/plans";
import {
  newSchoolSchema,
  PROVISION_AUDIENCE,
} from "@faridalms/domain/provisioning";
import { addDays } from "@faridalms/domain/school";
import { dayOpen, isoWeekday } from "@faridalms/domain/school-days";
import { DEFAULT_PERIODS } from "@faridalms/domain/timetable";
import { SQL } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import {
  client,
  periodOf,
  rejection,
  seeded,
  testCell,
  testDirectory,
} from "./harness";

const OPERATOR = "operator-under-test";
const operatorDirectory = openDirectoryAdmin(testDirectory().operatorUrl);
afterAll(() => operatorDirectory.close());

async function token(
  options: {
    secret?: Uint8Array;
    audience?: string;
    issuedAt?: number;
    seconds?: number;
    jti?: string;
  } = {},
) {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ name: "Salama Ashoush" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(OPERATOR)
    .setAudience(options.audience ?? PROVISION_AUDIENCE)
    .setJti(options.jti ?? crypto.randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (options.seconds ?? 60))
    .sign(options.secret ?? seeded().provisionSecret);
}

async function call(path: string, body: unknown, bearer?: string) {
  const response = await seeded().provisioner(
    new Request(`http://provisioner.test${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearer ?? (await token())}`,
      },
      body: JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function standalone(slug: string, email: string): NewSchoolInput {
  return {
    kind: "school",
    cellId: "eg-1",
    defaultLocale: "en",
    jurisdictions: ["EG"],
    schools: [
      {
        nameEn: `${slug} School`,
        nameAr: "مدرسة",
        slug,
        timeZone: "Africa/Cairo",
        countryCode: "EG",
      },
    ],
    administrators: [
      {
        givenNameEn: "Salama",
        familyNameEn: "Ashoush",
        givenNameAr: "سلامة",
        familyNameAr: "عشوش",
        email,
      },
    ],
  };
}

/** Writes the directory rows as the console does, before it calls the cell. */
async function begin(input: NewSchoolInput) {
  const spec = v.parse(newSchoolSchema, input);
  const ids = await operatorDirectory.beginTenant({
    tenantId: Bun.randomUUIDv7(),
    kind: spec.kind,
    nameEn: spec.nameEn,
    nameAr: spec.nameAr,
    cellId: spec.cellId,
    jurisdictions: spec.jurisdictions,
    schools: spec.schools.map((school) => ({
      id: Bun.randomUUIDv7(),
      slug: school.slug,
      nameEn: school.nameEn,
      nameAr: school.nameAr,
    })),
    entitlements: spec.entitlements,
    operatorId: OPERATOR,
  });
  return {
    ids,
    body: { tenantId: ids.tenantId, schoolIds: ids.schoolIds, spec },
  };
}

/** The secret in the last link emailed to the address, for the school. */
function linkTo(address: string, slug: string) {
  const message = seeded().mail.sent.findLast((row) => row.to === address);
  const secret = new RegExp(
    `//${slug}\\.[^/\\s]+/welcome#([A-Za-z0-9_-]{43})`,
  ).exec(message?.text ?? "")?.[1];
  if (!message || !secret) throw new Error(`no link was sent to ${address}`);
  return { message, secret };
}

async function choosePassword(slug: string, secret: string) {
  const password = "a long password the administrator chose";
  const open = client(slug);
  const { loginName } = await open.identity.acceptInvite({ secret, password });
  const session = await open.identity.signIn({ loginName, password });
  return { api: client(slug, session.token), loginName, password };
}

type SchoolApi = Awaited<ReturnType<typeof choosePassword>>["api"];

/** Sets the platform's usual school day from a date, as the office does on a school that has set none. */
async function setUsualDay(api: SchoolApi, from: string) {
  await api.periods.savePeriods({
    from,
    known: [],
    periods: DEFAULT_PERIODS.map((period) => ({
      nameEn: period.nameEn ?? "",
      nameAr: period.nameAr ?? "",
      kind: period.kind,
      startTime: period.startTime,
      endTime: period.endTime,
      official: period.official,
      weekdays: [...period.weekdays],
    })),
  });
}

/** The last day on or before `today` the school holds lessons on. */
async function lastSchoolDay(api: SchoolApi, today: string) {
  const read = await api.schoolDays.days({
    from: addDays(today, -14),
    to: today,
  });
  const marks = new Map(read.days.map((row) => [row.day, row.meaning]));
  for (let day = today; day >= read.from; day = addDays(day, -1))
    if (dayOpen(read, day, marks.get(day) ?? null)) return day;
  throw new Error("the school has had no school day yet");
}

describe("creating a school from the operator console", () => {
  test("a standalone school's administrator chooses a password and runs the school", async () => {
    const email = "salama@riverside.example.com";
    const { body } = await begin(standalone("riverside", email));
    const created = await call("/v1/tenants", body);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      tenantId: body.tenantId,
      created: true,
      sent: [{ schoolId: body.schoolIds[0], sentTo: email, loginName: email }],
    });

    const { message, secret } = linkTo(email, "riverside");
    expect(message.subject).toBe("riverside School: choose your password");
    expect(message.text).toContain(`Sign-in name: ${email}`);
    const { api, loginName } = await choosePassword("riverside", secret);
    expect(loginName).toBe(email);
    const me = await api.identity.currentUser();
    expect(me).toMatchObject({
      nameEn: "Salama Ashoush",
      nameAr: "سلامة عشوش",
      workspace: "staff",
      roles: ["system_administrator"],
      school: { slug: "riverside", timeZone: "Africa/Cairo" },
    });
    // Every capability of core and of the modules the new school has; those
    // of modules it has not are kept on the role and grant nothing.
    expect(me.capabilities.toSorted()).toEqual(
      CAPABILITIES.filter((capability) =>
        wordOn("capabilities", capability, me.modules),
      ).toSorted(),
    );
    expect(me.capabilities).not.toContain("admissions:manage");
  });

  test("a new school sets the usual day once, then places lessons and takes registers", async () => {
    const email = "salama@orchard.example.com";
    const { body } = await begin(standalone("orchard", email));
    expect((await call("/v1/tenants", body)).status).toBe(200);
    const { api } = await choosePassword(
      "orchard",
      linkTo(email, "orchard").secret,
    );
    const { today } = await api.identity.currentUser();
    const year = await api.years.save({
      titleEn: "Orchard year",
      titleAr: "",
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 200),
      terms: [],
    });
    expect((await api.periods.periods({ on: "" })).periods).toEqual([]);
    await setUsualDay(api, addDays(today, -40));
    const day = await api.periods.periods({ on: "" });
    expect(
      day.periods.map((period) => [
        period.nameEn,
        period.startTime,
        period.endTime,
        period.official,
      ]),
    ).toEqual(
      DEFAULT_PERIODS.map((period) => [
        period.nameEn,
        period.startTime,
        period.endTime,
        period.official,
      ]),
    );

    const teacher = await api.people.saveStaff({
      names: {
        en: { given: "Salama", middle: "", family: "Ashoush" },
        ar: { given: "سلامة", middle: "", family: "عشوش" },
      },
      email: "teacher@orchard.example.com",
      roles: ["teacher"],
    });
    const options = await api.classes.options();
    const [grade] = (await api.gradeLevels.options()).grades;
    const [subject] = options.subjects;
    if (!grade || !subject) throw new Error("the catalogue has no grades");
    const homeroom = await api.homerooms.save({
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 200),
      parts: { year: { yearId: year.id }, grade: { gradeId: grade.id } },
      code: "1A",
      titleEn: "1A",
      titleAr: "",
      homeroomTeacherId: teacher.id,
      subjects: [{ subjectId: subject.id, teacherIds: [teacher.id] }],
    });
    const relations = await api.guardians.relations();
    const mother = relations.find((row) => row.code === "mother");
    if (!mother) throw new Error("the catalogue has no mother");
    const student = await api.people.saveStudent({
      names: {
        en: { given: "Omar", middle: "", family: "Ashoush" },
        ar: { given: "عمر", middle: "", family: "عشوش" },
      },
      reference: "OR-0001",
      parts: {
        families: [
          {
            person: {
              names: {
                en: { given: "Mona", middle: "", family: "Ashoush" },
                ar: { given: "منى", middle: "", family: "عشوش" },
              },
              phone: "01012345678",
            },
            flags: {
              relationId: mother.id,
              legalGuardian: true,
              portalAccess: false,
              receivesNotifications: false,
              primaryContact: true,
              emergencyContact: true,
              residence: "primary",
              pickup: "allowed",
            },
          },
        ],
      },
    });
    await api.homerooms.place({
      studentId: student.id,
      classId: homeroom.id,
      from: addDays(today, -40),
    });

    const taught = await lastSchoolDay(api, today);
    const grid = await api.timetable.grid({ classId: homeroom.id, on: taught });
    const [lesson] = grid.periods;
    const [subjectClass] = grid.classes;
    if (!lesson || !subjectClass) throw new Error("nothing to place");
    await api.timetable.place({
      classId: homeroom.id,
      weekday: isoWeekday(taught),
      periodId: lesson.id,
      from: taught,
      meetingClassId: subjectClass.id,
      teacherId: teacher.id,
      roomId: "",
    });
    expect(
      (
        await api.timetable.grid({ classId: homeroom.id, on: taught })
      ).meetings.map((row) => [row.periodId, row.classId]),
    ).toEqual([[lesson.id, subjectClass.id]]);

    const register = await api.attendance.register({
      classId: homeroom.id,
      date: taught,
    });
    const official = day.periods.find((period) => period.official);
    expect(periodOf(register).id).toBe(official?.id ?? "");
    await api.attendance.save({
      classId: homeroom.id,
      date: taught,
      periodId: periodOf(register).id,
      expectedVersion: 0,
      marks: [{ studentId: student.id, meaning: "present" }],
    });
  });

  test("a school without homerooms teaches a class of its own, and the module answers nothing", async () => {
    const email = "salama@plainfield.example.com";
    const { body } = await begin({
      ...standalone("plainfield", email),
      entitlements: {
        ...settableOf(BASIC_ENTITLEMENTS),
        modules: MODULE_IDS.filter((id) => id !== "homerooms"),
      },
    });
    expect((await call("/v1/tenants", body)).status).toBe(200);
    const { api } = await choosePassword(
      "plainfield",
      linkTo(email, "plainfield").secret,
    );
    const { today, modules } = await api.identity.currentUser();
    expect(modules.homerooms).toBe(false);
    const year = await api.years.save({
      titleEn: "Plainfield year",
      titleAr: "",
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 200),
      terms: [],
    });
    await setUsualDay(api, addDays(today, -40));
    const teacher = await api.people.saveStaff({
      names: {
        en: { given: "Salama", middle: "", family: "Ashoush" },
        ar: { given: "سلامة", middle: "", family: "عشوش" },
      },
      email: "teacher@plainfield.example.com",
      roles: ["teacher"],
    });
    const course = await api.classes.save({
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 200),
      parts: { year: { yearId: year.id } },
      code: "PY-101",
      titleEn: "Python from scratch",
      titleAr: "",
      teacherIds: [teacher.id],
    });
    const relations = await api.guardians.relations();
    const mother = relations.find((row) => row.code === "mother");
    if (!mother) throw new Error("the catalogue has no mother");
    const learner = await api.people.saveStudent({
      names: {
        en: { given: "Omar", middle: "", family: "Ashoush" },
        ar: { given: "عمر", middle: "", family: "عشوش" },
      },
      reference: "PF-0001",
      parts: {
        families: [
          {
            person: {
              names: {
                en: { given: "Mona", middle: "", family: "Ashoush" },
                ar: { given: "منى", middle: "", family: "عشوش" },
              },
              phone: "01012345679",
            },
            flags: {
              relationId: mother.id,
              legalGuardian: true,
              portalAccess: false,
              receivesNotifications: false,
              primaryContact: true,
              emergencyContact: true,
              residence: "primary",
              pickup: "allowed",
            },
          },
        ],
      },
    });
    await api.classes.enrol({
      studentId: learner.id,
      classId: course.id,
      from: addDays(today, -40),
    });

    const record = await api.classes.record({ id: course.id });
    expect(record).toMatchObject({ subjectId: null, courseId: null });
    expect(record.roster.map((row) => row.userId)).toEqual([learner.id]);
    expect((await api.classes.directory({})).rows.map((row) => row.id)).toEqual(
      [course.id],
    );
    expect((await api.people.student({ id: learner.id })).group).toBeNull();
    const listed = await api.people.students({ q: "PF-0001" });
    expect(listed.rows[0]?.group).toBeNull();

    for (const ask of [
      () => api.homerooms.directory({}),
      () => api.homerooms.ofClass({ classId: course.id }),
      () => api.homerooms.history({ studentId: learner.id }),
      () => api.homerooms.unstaffed(),
      () => api.homerooms.place({ studentId: learner.id, classId: course.id }),
    ])
      expect(await rejection(ask())).toMatchObject({ code: "NOT_FOUND" });

    const taught = await lastSchoolDay(api, today);
    const grid = await api.timetable.grid({ classId: course.id, on: taught });
    expect(grid.classes.map((row) => row.id)).toEqual([course.id]);
    const official = new Set(
      (await api.periods.periods({ on: "" })).periods
        .filter((period) => period.official)
        .map((period) => period.id),
    );
    const lesson = grid.periods.find((period) => !official.has(period.id));
    if (!lesson) throw new Error("no lesson period");
    await api.timetable.place({
      classId: course.id,
      weekday: isoWeekday(taught),
      periodId: lesson.id,
      from: taught,
      meetingClassId: course.id,
      teacherId: teacher.id,
      roomId: "",
    });
    const register = await api.attendance.register({
      classId: course.id,
      date: taught,
    });
    expect(periodOf(register).id).toBe(lesson.id);
    expect(register.students.map((row) => row.id)).toEqual([learner.id]);
    await api.attendance.save({
      classId: course.id,
      date: taught,
      periodId: periodOf(register).id,
      expectedVersion: 0,
      marks: [{ studentId: learner.id, meaning: "present" }],
    });
    const board = await api.attendance.board({ date: taught });
    expect(board.rows.every((row) => !row.daily)).toBe(true);

    const work = await api.coursework.save({
      classId: course.id,
      title: "First program",
      brief: plainContent("Write a program that says hello."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    await api.coursework.publish({
      id: work.id,
      expectedVersion: work.version,
    });
    expect(
      (await api.coursework.record({ id: work.id })).work.map(
        (row) => row.studentId,
      ),
    ).toEqual([learner.id]);
  });

  test("a new school with no year yet answers the pages that read one with nothing, and refuses what needs one", async () => {
    const email = "salama@aspen.example.com";
    const { body } = await begin({
      ...standalone("aspen", email),
      entitlements: {
        ...settableOf(BASIC_ENTITLEMENTS),
        modules: [...MODULE_IDS],
      },
    });
    expect((await call("/v1/tenants", body)).status).toBe(200);
    const { api } = await choosePassword(
      "aspen",
      linkTo(email, "aspen").secret,
    );
    await api.school.setFeature({ feature: "elearning", enabled: true });

    expect(await api.learning.options()).toEqual({ classes: [], modules: [] });
    expect(await api.learning.modules({ classId: "" })).toEqual({
      classes: [],
      rows: [],
    });
    expect(await api.learning.unitPlan({ classId: "" })).toEqual({
      classes: [],
      classId: "",
      opening: "",
      ready: false,
      frame: null,
      units: [],
    });
    // Registers belong to no year: a new school's board reads its day.
    expect(await api.attendance.board({ date: "" })).toMatchObject({
      rows: [],
    });
    expect(
      await rejection(
        api.learning.saveModule({
          id: "",
          expectedVersion: 0,
          title: "Salama's first module",
          summary: "",
          classIds: [crypto.randomUUID()],
          prerequisiteId: "",
          sequential: false,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", message: "learning.class" });

    // Its setup waits for it on Today, and cannot be hidden half done.
    const onboarding = (await api.home.admin()).onboarding;
    expect(onboarding?.steps.map((step) => [step.id, step.done])).toEqual([
      ["details", false],
      ["year", false],
      ["classes", false],
      ["staff", false],
      ["students", false],
      ["timetable", false],
      ["website", false],
      ["admissions", false],
    ]);
    expect(await rejection(api.home.hideOnboarding())).toMatchObject({
      code: "CONFLICT",
      message: "onboarding.not_finished",
    });
  });

  test("each school of a group has its own administrator, and the group's runs them all", async () => {
    const east = "salama@harbour.example.com";
    const west = "mona@harbour.example.com";
    const group = "omar@harbour.example.com";
    const { body } = await begin({
      ...standalone("harbour-east", east),
      kind: "school_group",
      nameEn: "Harbour Schools",
      nameAr: "مدارس الميناء",
      schools: [
        {
          nameEn: "Harbour East",
          slug: "harbour-east",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
        },
        {
          nameEn: "Harbour West",
          slug: "harbour-west",
          timeZone: "Asia/Dubai",
          countryCode: "AE",
        },
      ],
      administrators: [
        { givenNameEn: "Salama", familyNameEn: "Ashoush", email: east },
        { givenNameEn: "Mona", familyNameEn: "Hassan", email: west },
      ],
      groupAdministrator: {
        givenNameEn: "Omar",
        familyNameEn: "Farouk",
        email: group,
      },
    });
    const created = await call("/v1/tenants", body);
    expect(created).toMatchObject({
      status: 200,
      body: {
        created: true,
        sent: [
          { schoolId: body.schoolIds[0], sentTo: east },
          { schoolId: body.schoolIds[1], sentTo: west },
          { schoolId: null, sentTo: group },
        ],
      },
    });
    // Each school keeps its own weekend, which the console waits for.
    const calendar = await call("/v1/tenants/calendar", {
      tenantId: body.tenantId,
    });
    expect(calendar.body.schools).toHaveLength(2);
    expect(calendar).toMatchObject({
      status: 200,
      body: {
        schools: expect.arrayContaining([
          { timeZone: "Africa/Cairo", weekendDays: [5, 6] },
          { timeZone: "Asia/Dubai", weekendDays: [6, 7] },
        ]),
      },
    });
    expect(
      await call("/v1/tenants/calendar", { tenantId: crypto.randomUUID() }),
    ).toMatchObject({ status: 404, body: { message: "tenant.not_in_cell" } });
    const { api } = await choosePassword(
      "harbour-east",
      linkTo(east, "harbour-east").secret,
    );
    expect(await api.identity.currentUser()).toMatchObject({
      workspace: "staff",
      school: { slug: "harbour-east" },
    });
    // A school's administrator belongs to that school only.
    expect(
      await rejection(
        client("harbour-west").identity.signIn({
          loginName: east,
          password: "a long password the administrator chose",
        }),
      ),
    ).toMatchObject({ message: "auth.invalid_credentials" });
    const westAdmin = await choosePassword(
      "harbour-west",
      linkTo(west, "harbour-west").secret,
    );
    expect(await westAdmin.api.identity.currentUser()).toMatchObject({
      workspace: "staff",
      school: { slug: "harbour-west" },
    });

    // The group's administrator, whose link opens at the first school, runs both.
    const groupAdmin = await choosePassword(
      "harbour-east",
      linkTo(group, "harbour-east").secret,
    );
    expect(await groupAdmin.api.identity.currentUser()).toMatchObject({
      workspace: "staff",
      roles: ["district_administrator"],
    });
    const atWest = await client("harbour-west").identity.signIn({
      loginName: group,
      password: groupAdmin.password,
    });
    expect(
      await client("harbour-west", atWest.token).identity.currentUser(),
    ).toMatchObject({ workspace: "staff", school: { slug: "harbour-west" } });

    // Asked again, nothing is created twice and each is sent a new link.
    expect(await call("/v1/tenants", body)).toMatchObject({
      status: 200,
      body: { created: false, sent: [{}, {}, {}] },
    });
  });

  test("an email the gateway refuses leaves nothing in the cell, and the retry creates the school", async () => {
    const { body } = await begin(
      standalone("brookside", "reject@brookside.example.com"),
    );
    const refused = await call("/v1/tenants", body);
    expect(refused).toMatchObject({
      status: 502,
      body: { code: "BAD_GATEWAY", message: "sign_in.not_sent" },
    });
    expect(
      await rejection(
        client("brookside").identity.signIn({
          loginName: "reject@brookside.example.com",
          password: "a long password the administrator chose",
        }),
      ),
    ).toMatchObject({ code: "UNAUTHORIZED" });

    const email = "salama@brookside.example.com";
    const { ids, body: again } = await begin(standalone("brookside", email));
    expect(ids).toMatchObject({ tenantId: body.tenantId, retry: true });
    const created = await call("/v1/tenants", again);
    expect(created).toMatchObject({
      status: 200,
      body: { created: true, sent: [{ sentTo: email }] },
    });
    await choosePassword("brookside", linkTo(email, "brookside").secret);
  });

  test("a retry for a school the cell already holds only sends a new link", async () => {
    const email = "salama@millbrook.example.com";
    const { body } = await begin(standalone("millbrook", email));
    expect((await call("/v1/tenants", body)).status).toBe(200);
    const first = linkTo(email, "millbrook").secret;

    const retried = await call("/v1/tenants", body);
    expect(retried).toMatchObject({
      status: 200,
      body: {
        created: false,
        sent: [{ sentTo: email, loginName: email }],
      },
    });
    const second = linkTo(email, "millbrook").secret;
    expect(second).not.toBe(first);
    expect(
      await rejection(client("millbrook").identity.invite({ secret: first })),
    ).toMatchObject({ message: "auth.invalid_invite" });
    const { api } = await choosePassword("millbrook", second);
    const staff = await api.people.staff({});
    expect(staff.rows.map((row) => row.email)).toEqual([email]);

    const elsewhere = await call("/v1/tenants", {
      ...body,
      spec: {
        ...body.spec,
        administrators: [
          {
            ...body.spec.administrators[0],
            email: "someone.else@millbrook.example.com",
          },
        ],
      },
    });
    expect(elsewhere).toMatchObject({
      status: 409,
      body: { message: "administrator.not_found" },
    });
  });

  test("the administrator can be sent a new link, which replaces a chosen password", async () => {
    const email = "salama@fairview.example.com";
    const { ids, body } = await begin(standalone("fairview", email));
    expect((await call("/v1/tenants", body)).status).toBe(200);
    await choosePassword("fairview", linkTo(email, "fairview").secret);
    const schoolId = ids.schoolIds[0];

    const resent = await call("/v1/invites", {
      tenantId: ids.tenantId,
      schoolId,
    });
    expect(resent).toMatchObject({
      status: 200,
      body: { sentTo: email, loginName: email, reset: true },
    });
    expect(
      await client("fairview").identity.invite({
        secret: linkTo(email, "fairview").secret,
      }),
    ).toMatchObject({ loginName: email, reset: true });
    expect(
      await call("/v1/invites", {
        tenantId: ids.tenantId,
        schoolId,
        email: "nobody@fairview.example.com",
      }),
    ).toMatchObject({
      status: 404,
      body: { message: "administrator.not_found" },
    });
  });

  test("a tenant is paused, suspended and reopened in its cell, named in its audit log", async () => {
    const email = "salama@pinegrove.example.com";
    const { ids, body } = await begin(standalone("pinegrove", email));
    expect((await call("/v1/tenants", body)).status).toBe(200);
    const move = (lifecycle: string) =>
      call("/v1/tenants/lifecycle", {
        tenantId: ids.tenantId,
        lifecycle,
        reason: "Invoice unpaid for 60 days",
      });
    expect(await move("read_only")).toMatchObject({
      status: 200,
      body: { before: "active", lifecycle: "read_only" },
    });
    expect(await move("suspended")).toMatchObject({
      status: 200,
      body: { before: "read_only", lifecycle: "suspended" },
    });
    expect(await move("active")).toMatchObject({
      status: 200,
      body: { before: "suspended", lifecycle: "active" },
    });
    const sql = new SQL(testCell().adminUrl);
    try {
      const rows = await sql<{ details: { reason: string } }[]>`
        select details from audit.log
        where tenant_id = ${ids.tenantId}::uuid and action = 'tenant.lifecycle'`;
      expect(rows).toHaveLength(3);
      expect(rows[0]?.details.reason).toBe("Invoice unpaid for 60 days");
    } finally {
      await sql.close();
    }
    expect(
      await call("/v1/tenants/lifecycle", {
        tenantId: crypto.randomUUID(),
        lifecycle: "read_only",
        reason: "No such tenant",
      }),
    ).toMatchObject({ status: 409, body: { message: "tenant.not_settable" } });
  });

  test("a change to what a tenant may use reaches a server's held rows once its cell is told", async () => {
    const email = "salama@larchwood.example.com";
    const { ids, body } = await begin(standalone("larchwood", email));
    expect((await call("/v1/tenants", body)).status).toBe(200);
    const { api } = await choosePassword(
      "larchwood",
      linkTo(email, "larchwood").secret,
    );
    const versionOf = () =>
      seeded().cell.withTenant(
        {
          tenantId: ids.tenantId,
          requestId: crypto.randomUUID(),
          actor: { kind: "system" },
        },
        "read",
        async (_tx, _lifecycle, _now, version) => version,
      );
    expect(await versionOf()).toBe(0);

    // A server holding the school's row for a minute, as each cell does.
    const held = openDirectory(testDirectory().readerUrl, 60_000);
    const sql = new SQL(testDirectory().adminUrl);
    const notice = (value: string) =>
      sql`update school_entitlements set notice = ${value}
        where school_id = ${ids.schoolIds[0] ?? ""}::uuid`;
    const shown = async () =>
      (await held.bySlug("larchwood"))?.entitlements.notice ?? null;
    try {
      expect(await shown()).toBeNull();
      await notice("payment_overdue");
      expect(await shown()).toBeNull();
      // The first version a server sees for a tenant drops what it holds.
      held.observeEntitlements(ids.tenantId, await versionOf());
      expect(await shown()).toBe("payment_overdue");

      await notice("plan_ends_soon");
      held.observeEntitlements(ids.tenantId, await versionOf());
      expect(await shown()).toBe("payment_overdue");
      expect(
        await call("/v1/tenants/entitlements", { tenantId: ids.tenantId }),
      ).toMatchObject({ status: 200, body: { version: 1 } });
      held.observeEntitlements(ids.tenantId, await versionOf());
      expect(await shown()).toBe("plan_ends_soon");
    } finally {
      await sql.close();
      await held.close();
    }
    expect((await api.identity.currentUser()).contract?.notice).toBe(
      "plan_ends_soon",
    );

    expect(
      await call("/v1/tenants/entitlements", { tenantId: crypto.randomUUID() }),
    ).toMatchObject({ status: 404, body: { message: "tenant.not_in_cell" } });
  });

  test("a call without a good token is refused before anything is read", async () => {
    const { body } = await begin(
      standalone("oakridge", "salama@oakridge.example.com"),
    );
    const replayed = await token();
    for (const bearer of [
      await token({ secret: new Uint8Array(randomBytes(32)) }),
      await token({ issuedAt: Math.floor(Date.now() / 1000) - 120 }),
      await token({ audience: "farida-api" }),
      await token({ seconds: 600 }),
      "not-a-token",
    ])
      expect(await call("/v1/tenants", body, bearer)).toMatchObject({
        status: 401,
        body: { code: "UNAUTHORIZED" },
      });
    expect((await call("/v1/tenants", body, replayed)).status).toBe(200);
    expect(await call("/v1/tenants", body, replayed)).toMatchObject({
      status: 401,
    });
    const unsigned = await seeded().provisioner(
      new Request("http://provisioner.test/v1/tenants", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(unsigned.status).toBe(401);
  });

  test("the schema refuses an address the platform keeps, and so does the provisioner", async () => {
    const { body } = await begin(
      standalone("pinecrest", "salama@pinecrest.example.com"),
    );
    const reserved = await call("/v1/tenants", {
      ...body,
      spec: {
        ...body.spec,
        schools: body.spec.schools.map((school) => ({
          ...school,
          slug: "admin",
        })),
      },
    });
    expect(reserved).toMatchObject({
      status: 400,
      body: { code: "BAD_REQUEST", message: "validation" },
    });
  });

  test("a tenant the directory does not place in this cell is not created", async () => {
    const spec = v.parse(
      newSchoolSchema,
      standalone("nowhere", "salama@nowhere.example.com"),
    );
    expect(
      await call("/v1/tenants", {
        tenantId: Bun.randomUUIDv7(),
        schoolIds: [Bun.randomUUIDv7()],
        spec,
      }),
    ).toMatchObject({
      status: 404,
      body: { message: "tenant.not_in_directory" },
    });
  });

  test("the directory refuses an address in use, and keeps a provisioning tenant's ids for its retry", async () => {
    expect(
      await rejection(
        begin(standalone("northwind", "salama@northwind.example.com")),
      ),
    ).toMatchObject({ slugs: ["northwind"], pending: false });
    const email = "salama@elmwood.example.com";
    const { ids } = await begin(standalone("elmwood", email));
    const again = await begin(standalone("elmwood", email));
    expect(again.ids).toEqual({ ...ids, retry: true });
    const differs = await rejection(
      begin({
        ...standalone("elmwood", email),
        kind: "school_group",
        nameEn: "Elmwood Group",
      }),
    );
    expect(differs).toBeInstanceOf(SlugTakenError);
    expect(differs).toMatchObject({ slugs: ["elmwood"], pending: true });
    const { directory } = seeded();
    expect(await directory.tenantsOfCell("eg-1")).not.toContain(ids.tenantId);

    expect((await call("/v1/tenants", again.body)).status).toBe(200);

    expect(
      await operatorDirectory.activateTenant({
        tenantId: ids.tenantId,
        operatorId: OPERATOR,
      }),
    ).toBe(true);
    expect(
      await operatorDirectory.activateTenant({
        tenantId: ids.tenantId,
        operatorId: OPERATOR,
      }),
    ).toBe(false);
    expect(await rejection(begin(standalone("elmwood", email)))).toMatchObject({
      slugs: ["elmwood"],
      pending: false,
    });
    expect(await directory.tenantsOfCell("eg-1")).toContain(ids.tenantId);
    const school = await operatorDirectory.school(ids.schoolIds[0] ?? "");
    expect(school).toMatchObject({
      tenantState: "active",
      tenantKind: "school",
    });
    expect(
      (await operatorDirectory.changes({ id: ids.tenantId })).map((change) => [
        change.action,
        change.actor,
      ]),
    ).toEqual([
      ["tenant.activate", `operator:${OPERATOR}`],
      ["tenant.retry", `operator:${OPERATOR}`],
      ["tenant.create", `operator:${OPERATOR}`],
    ]);
  });

  test("the public API has no provisioning route", async () => {
    const response = await seeded().handler(
      new Request("http://api.test/v1/tenants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await token()}`,
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(404);
  });
});

/** A new school with these modules off, its administrator signed in, a teacher, a class with no year and a student in it. */
async function schoolWithout(
  slug: string,
  off: readonly string[],
  options: { usualDay: boolean },
) {
  const email = `salama@${slug}.example.com`;
  const { body } = await begin({
    ...standalone(slug, email),
    entitlements: {
      ...settableOf(BASIC_ENTITLEMENTS),
      modules: MODULE_IDS.filter((id) => !off.includes(id)),
    },
  });
  expect((await call("/v1/tenants", body)).status).toBe(200);
  const { api } = await choosePassword(slug, linkTo(email, slug).secret);
  const { today, modules } = await api.identity.currentUser();
  for (const id of off) expect(modules[id as keyof typeof modules]).toBe(false);
  if (options.usualDay) await setUsualDay(api, addDays(today, -40));
  const teacher = await api.people.saveStaff({
    names: {
      en: { given: "Salama", middle: "", family: "Ashoush" },
      ar: { given: "سلامة", middle: "", family: "عشوش" },
    },
    email: `teacher@${slug}.example.com`,
    roles: ["teacher"],
  });
  const course = await api.classes.save({
    startsOn: addDays(today, -40),
    code: "RUN-1",
    titleEn: "Running club",
    titleAr: "",
    teacherIds: [teacher.id],
  });
  const learner = await api.people.saveStudent({
    names: {
      en: { given: "Omar", middle: "", family: "Ashoush" },
      ar: { given: "عمر", middle: "", family: "عشوش" },
    },
    reference: `${slug.toUpperCase()}-1`,
  });
  await api.classes.enrol({
    studentId: learner.id,
    classId: course.id,
    from: addDays(today, -40),
  });
  return { api, today, teacher, course, learner };
}

describe("registers by class and date", () => {
  test("a school without school years or a timetable takes each class's register of the whole day, once a day, and never in a period", async () => {
    const { api, today, course, learner } = await schoolWithout(
      "meadow",
      ["school_years", "timetable"],
      { usualDay: false },
    );
    const taught = await lastSchoolDay(api, today);
    const register = await api.attendance.register({
      classId: course.id,
      date: taught,
    });
    expect(register.period).toBeNull();
    expect(register.periods).toEqual([]);
    expect(register.register).toBeNull();
    expect(register.access).toEqual({ editable: true });
    expect(
      await rejection(
        api.attendance.save({
          classId: course.id,
          date: taught,
          periodId: crypto.randomUUID(),
          expectedVersion: 0,
          marks: [],
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "attendance.no_period" });
    expect(
      await api.attendance.save({
        classId: course.id,
        date: taught,
        periodId: "",
        expectedVersion: 0,
        marks: [{ studentId: learner.id, meaning: "absent" }],
      }),
    ).toMatchObject({ state: "submitted" });
    expect(
      await rejection(
        api.attendance.save({
          classId: course.id,
          date: taught,
          periodId: "",
          expectedVersion: 0,
          marks: [{ studentId: learner.id, meaning: "present" }],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });
    const again = await api.attendance.register({
      classId: course.id,
      date: taught,
    });
    expect(again.register?.state).toBe("submitted");
    expect(again.marks).toEqual([
      expect.objectContaining({ studentId: learner.id, meaning: "absent" }),
    ]);

    const board = await api.attendance.board({ date: taught });
    expect(board.rows).toEqual([
      expect.objectContaining({
        classId: course.id,
        kind: "day",
        periodId: "",
        periodNameEn: null,
        state: "submitted",
      }),
    ]);
    const report = await api.attendance.report({});
    expect(report.spans).toEqual([]);
    expect(report.span).toBe("");
    expect(report.from).toBe(addDays(today, 1 - 7 * 12));
    expect(report.rows).toEqual([
      expect.objectContaining({
        id: learner.id,
        counts: expect.objectContaining({ absent: 1 }),
      }),
    ]);
    const summary = await api.attendance.student({ studentId: learner.id });
    expect(summary.span).toMatchObject({ titleEn: null, titleAr: null });
    expect(summary.summary.sessions).toBe(1);
    expect(await rejection(api.timetable.options({}))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await rejection(api.periods.periods({ on: "" }))).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("a school without school years plans a class in no year on the timetable, takes its register in the period, and changes its lesson for a day", async () => {
    const { api, today, teacher, course, learner } = await schoolWithout(
      "linden",
      ["school_years"],
      { usualDay: true },
    );
    const taught = await lastSchoolDay(api, today);
    const grid = await api.timetable.grid({ classId: course.id, on: taught });
    expect(grid.canPlan).toBe(true);
    const lesson = grid.periods[1];
    if (!lesson) throw new Error("the usual day has lessons");
    await api.timetable.place({
      classId: course.id,
      weekday: isoWeekday(taught),
      periodId: lesson.id,
      from: taught,
      meetingClassId: course.id,
      teacherId: teacher.id,
      roomId: "",
    });
    const week = await api.timetable.classWeek({
      classId: course.id,
      on: taught,
    });
    expect(
      week.week.meetings
        .filter((row) => row.on === taught)
        .map((row) => row.periodId),
    ).toEqual([lesson.id]);
    const onboarding = (await api.home.admin()).onboarding;
    expect(
      onboarding?.steps.find((step) => step.id === "timetable")?.done,
    ).toBe(true);

    const register = await api.attendance.register({
      classId: course.id,
      date: taught,
    });
    expect(periodOf(register).id).toBe(lesson.id);
    expect(
      await rejection(
        api.attendance.save({
          classId: course.id,
          date: taught,
          periodId: "",
          expectedVersion: 0,
          marks: [],
        }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "attendance.period_required",
    });
    await api.attendance.save({
      classId: course.id,
      date: taught,
      periodId: lesson.id,
      expectedVersion: 0,
      marks: [{ studentId: learner.id, meaning: "present" }],
    });
    const board = await api.attendance.board({ date: taught });
    expect(board.rows).toEqual([
      expect.objectContaining({
        classId: course.id,
        kind: "period",
        periodId: lesson.id,
        state: "submitted",
      }),
    ]);

    const next = addDays(taught, 7);
    await api.cover.changeLesson({
      classId: course.id,
      periodId: lesson.id,
      on: next,
      expected: "",
      coverId: "",
      roomId: "",
      cancelled: true,
      note: "",
    });
    const changed = await api.timetable.classWeek({
      classId: course.id,
      on: next,
    });
    expect(
      changed.week.meetings.find((row) => row.on === next)?.change?.cancelled,
    ).toBe(true);
  });

  test("with the timetable on, a day that holds no periods takes the register of the whole day: before any are set, and on a schedule that holds none", async () => {
    const { api, today, course } = await schoolWithout(
      "willow",
      ["school_years"],
      { usualDay: false },
    );
    const taught = await lastSchoolDay(api, today);
    const unset = await api.attendance.register({
      classId: course.id,
      date: taught,
    });
    expect(unset.period).toBeNull();
    expect(unset.periods).toEqual([]);

    await setUsualDay(api, addDays(today, -40));
    expect(
      (await api.attendance.register({ classId: course.id, date: taught }))
        .period,
    ).not.toBeNull();
    const schedule = await api.periods.saveSchedule({
      nameEn: "Sports day",
      nameAr: "اليوم الرياضي",
      times: [],
      extras: [
        {
          code: "games",
          nameEn: "Games",
          nameAr: "الألعاب",
          kind: "break",
          startTime: "09:00",
          endTime: "12:00",
        },
      ],
    });
    await api.periods.scheduleRange({
      from: taught,
      to: taught,
      scheduleId: schedule.id,
    });
    const sportsDay = await api.attendance.register({
      classId: course.id,
      date: taught,
    });
    expect(sportsDay.period).toBeNull();
    expect(sportsDay.periods).toEqual([]);
    await api.attendance.save({
      classId: course.id,
      date: taught,
      periodId: "",
      expectedVersion: 0,
      marks: [],
    });
  });

  test("with school years on, the days after a year owe no register and hold no lesson of its classes, while a class with no end keeps its lessons there until the school closes those days", async () => {
    const { api, today, teacher, course } = await schoolWithout("rowan", [], {
      usualDay: true,
    });
    const year = await api.years.save({
      titleEn: "Rowan year",
      titleAr: "",
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 20),
      terms: [],
    });
    const inYear = await api.classes.save({
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 20),
      parts: { year: { yearId: year.id } },
      code: "YEAR-1",
      titleEn: "Year class",
      titleAr: "",
      teacherIds: [teacher.id],
    });
    const taught = await lastSchoolDay(api, today);
    const lesson = (
      await api.timetable.grid({ classId: course.id, on: taught })
    ).periods[1];
    if (!lesson) throw new Error("the usual day has lessons");
    for (const classId of [course.id, inYear.id])
      await api.timetable.place({
        classId,
        weekday: isoWeekday(taught),
        periodId: lesson.id,
        from: taught,
        meetingClassId: classId,
        teacherId: "",
        roomId: "",
      });
    const after = addDays(taught, 35);
    const owed = (await api.attendance.board({ date: after })).rows.map(
      (row) => row.classId,
    );
    expect(owed).toEqual([course.id]);
    const heldOn = async (classId: string) =>
      (await api.timetable.classWeek({ classId, on: after })).week.meetings
        .filter((row) => row.on === after)
        .map((row) => row.classId);
    expect(await heldOn(inYear.id)).toEqual([]);
    expect(await heldOn(course.id)).toEqual([course.id]);

    await api.schoolDays.paint({
      from: addDays(today, 21),
      to: addDays(today, 60),
      kind: "school_holiday",
      noteEn: "Summer",
      noteAr: "",
      provisional: false,
    });
    const closed = await api.attendance.board({ date: after });
    expect(closed).toMatchObject({ schoolDay: false, rows: [] });
    expect(await heldOn(course.id)).toEqual([]);
  });
});
