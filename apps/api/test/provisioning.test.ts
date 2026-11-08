import type { NewSchoolInput } from "@faridalms/domain/provisioning";

import {
  openDirectoryAdmin,
  SlugTakenError,
} from "@faridalms/database/directory/admin";
import { openDirectory } from "@faridalms/database/directory/client";
import { CAPABILITIES } from "@faridalms/domain/capabilities";
import {
  newSchoolSchema,
  PROVISION_AUDIENCE,
} from "@faridalms/domain/provisioning";
import { addDays } from "@faridalms/domain/school";
import { DEFAULT_PERIODS, isoWeekday } from "@faridalms/domain/timetable";
import { SQL } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import * as v from "valibot";

import { client, rejection, seeded, testCell, testDirectory } from "./harness";

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
    expect(me.capabilities.toSorted()).toEqual([...CAPABILITIES].toSorted());
  });

  test("a new school's first year has a working day, so lessons are placed and registers taken", async () => {
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
    const day = await api.years.periods({ id: year.id, on: "" });
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
    const [grade] = options.grades;
    const [subject] = options.subjects;
    if (!grade || !subject) throw new Error("the catalogue has no grades");
    const homeroom = await api.classes.save({
      yearId: year.id,
      code: "1A",
      titleEn: "1A",
      titleAr: "",
      gradeId: grade.id,
      homeroomTeacherId: teacher.id,
      subjects: [{ subjectId: subject.id, teacherIds: [teacher.id] }],
    });
    const people = await api.people.options();
    const mother = people.relations.find((row) => row.code === "mother");
    if (!mother) throw new Error("the catalogue has no mother");
    const student = await api.people.saveStudent({
      names: {
        en: { given: "Omar", middle: "", family: "Ashoush" },
        ar: { given: "عمر", middle: "", family: "عشوش" },
      },
      reference: "OR-0001",
      guardians: [
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
    });
    await api.classes.enrol({
      studentId: student.id,
      classId: homeroom.id,
      from: addDays(today, -40),
    });

    const { days } = await api.years.days({ id: year.id });
    const taught = days
      .filter((row) => row.day <= today && row.meaning === "instructional_day")
      .at(-1)?.day;
    if (!taught) throw new Error("the year has no school day yet");
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
    expect(register.period.id).toBe(official?.id ?? "");
    await api.attendance.save({
      classId: homeroom.id,
      date: taught,
      periodId: register.period.id,
      expectedVersion: 0,
      marks: [{ studentId: student.id, meaning: "present" }],
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
