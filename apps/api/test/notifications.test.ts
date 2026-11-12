import { plainContent } from "@faridalms/domain/content-conversion";
import { DEFAULT_PREFERENCES } from "@faridalms/domain/notifications";
import { MemoryProvider } from "@faridalms/mail/providers";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { workerScope } from "../src/core/extension";
import { notifyIn } from "../src/core/notify";
import { deliverTenant } from "../src/notifications/deliver";
import {
  login,
  periodOf,
  rejection,
  runDay,
  schoolDayBack,
  seeded,
  sessionFor,
  signedIn,
  withoutModules,
  workerModules,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

const announce = async (
  office: Awaited<ReturnType<typeof principal>>,
  title: string,
  urgency: "normal" | "urgent",
) => {
  const saved = await office.announcements.save({
    id: "",
    expectedVersion: 0,
    primaryLocale: "en" as const,
    titleEn: title,
    titleAr: "",
    body: plainContent(`${title}.`),
    translation: null,
    audiences: [{ scope: "families", classId: "", targetId: "" }],
    urgency,
    pinnedUntil: "",
    expiresOn: "",
    requiresAck: false,
    ackDueOn: "",
  });
  await office.announcements.publish({
    id: saved.id,
    expectedVersion: saved.version,
  });
  return saved.id;
};

describe("the notification centre", () => {
  test("a notice that asks for acknowledgement waits under action until given", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      id: "",
      expectedVersion: 0,
      primaryLocale: "en",
      titleEn: "Swimming consent",
      titleAr: "",
      body: plainContent("Please acknowledge the swimming lessons."),
      translation: null,
      audiences: [{ scope: "families", classId: "", targetId: "" }],
      urgency: "normal",
      pinnedUntil: "",
      expiresOn: "",
      requiresAck: true,
      ackDueOn: "",
    });
    await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const family = await mother();
    const waiting = await family.notifications.list({ tab: "action" });
    const notice = waiting.rows.find((row) => row.subjectId === saved.id);
    if (!notice) throw new Error("the family got no notice");
    expect(notice.needsAction).toBe(true);
    expect(waiting.waiting).toBeGreaterThan(0);

    await family.announcements.seen({
      id: saved.id,
      acknowledge: true,
    });
    const after = await family.notifications.list({ tab: "action" });
    expect(after.rows.some((row) => row.id === notice.id)).toBe(false);
    const all = await family.notifications.list({ tab: "all" });
    expect(all.rows.find((row) => row.id === notice.id)?.readAt).not.toBeNull();
  });

  test("a busy thread rings once until it is read", async () => {
    const office = await principal();
    const family = await mother();
    const me = await family.identity.currentUser();
    const teacher = await (
      await signedIn("northwind", login("teacher"))
    ).identity.currentUser();
    // A direct conversation between the two is continued wherever another
    // test left it, with its notices; a group one is always new.
    const { threadId } = await office.messages.start({
      kind: "group",
      recipientIds: [me.id, teacher.id],
      studentId: "",
      subject: `Busy thread ${crypto.randomUUID().slice(0, 8)}`,
      content: plainContent("Could we speak on Monday?"),
    });
    await office.messages.send({
      threadId,
      content: plainContent("Or Tuesday."),
    });
    const about = (await family.notifications.list({ tab: "all" })).rows.filter(
      (row) => row.subjectId === threadId,
    );
    expect(about).toHaveLength(1);
    expect(about[0]?.kind).toBe("message");

    await family.messages.markRead({ threadId });
    expect(
      (await family.notifications.list({ tab: "all" })).rows.find(
        (row) => row.subjectId === threadId,
      )?.readAt,
    ).not.toBeNull();
  });
});

describe("reaching people outside the app", () => {
  test("choices decide the email, but an urgent notice goes regardless", async () => {
    const family = await mother();
    await family.notifications.savePreferences({
      preferences: {
        ...DEFAULT_PREFERENCES,
        email: { ...DEFAULT_PREFERENCES.email, announcement: "off" },
      },
      locale: "ar",
    });
    expect((await family.notifications.preferences()).locale).toBe("ar");

    const office = await principal();
    await announce(office, "Library closed Thursday", "normal");
    await announce(office, "Early closing today", "urgent");

    const me = await family.identity.currentUser();
    const mine = async (title: string) =>
      (
        await office.notifications.deliveries({ channel: "email", q: title })
      ).rows.find((row) => row.userId === me.id);
    expect((await mine("Library closed Thursday"))?.reason).toBe(
      "preference_off",
    );
    const urgent = await mine("Early closing today");
    expect(urgent?.kind).toBe("urgent");
    expect(["pending", "skipped"]).toContain(urgent?.state ?? "");
  });

  test("a pass sends what is due and a failing gateway retries", async () => {
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId;
    if (!tenantId) throw new Error("no seeded tenant");
    const office = await principal();
    await announce(office, "Photos day", "urgent");
    const email = new MemoryProvider();
    const first = await deliverTenant(
      cell,
      { email, sms: null },
      tenantId,
      workerModules(),
    );
    expect(first.sent).toBeGreaterThan(0);
    expect(email.sent.some((row) => row.subject.includes("Photos day"))).toBe(
      true,
    );
    const log = await office.notifications.deliveries({
      state: "sent",
      q: "Photos day",
    });
    expect(log.rows.length).toBeGreaterThan(0);
    const again = await deliverTenant(
      cell,
      { email, sms: null },
      tenantId,
      workerModules(),
    );
    expect(again.sent).toBe(0);
  });

  test("only the office reads the delivery log", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(teacher.api.notifications.deliveries({})),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("absence notices", () => {
  test("an unexplained absence tells the family once, and a correction takes it back", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const probe = await office.attendance.day({});
    // The school day before the latest one, which the register test takes:
    // on a weekend both would otherwise walk back to the same day.
    const date = schoolDayBack(runDay(probe.today), 2);
    const { rows } = await office.attendance.board({ date });
    const registers = await Promise.all(
      rows
        .filter((row) => row.daily)
        .map((row) =>
          office.attendance.register({
            classId: row.classId,
            date,
            periodId: row.periodId,
          }),
        ),
    );
    const homeroom = registers.find((register) =>
      register.students.some((row) => row.id === me.id),
    );
    if (!homeroom) throw new Error("the seeded student has no homeroom");
    const marks = (meaning: "absent" | "present") =>
      homeroom.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? meaning : ("present" as const),
      }));
    const absent = await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: periodOf(homeroom).id,
      expectedVersion: homeroom.register?.version ?? 0,
      marks: marks("absent"),
    });

    const family = await mother();
    const notices = () =>
      family.notifications
        .list({ tab: "all" })
        .then((page) =>
          page.rows.filter(
            (row) =>
              row.kind === "absence" &&
              row.subjectId === me.id &&
              row.params.date === date,
          ),
        );
    expect(await notices()).toHaveLength(1);

    await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: periodOf(homeroom).id,
      expectedVersion: absent.version,
      marks: marks("present"),
      correction: "The family rang: she was in the library.",
    });
    expect(await notices()).toHaveLength(0);
  });

  test("an absence reaches a guardian who receives notices without the family app", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const father = (
      await office.guardians.ofStudent({ studentId: me.id })
    ).guardians.find((row) => row.relationMeaning === "father");
    if (!father || father.portalAccess)
      throw new Error("the seeded father uses the family app");
    await office.guardians.saveLink({
      studentId: me.id,
      relationshipId: father.relationshipId,
      expectedVersion: father.version,
      flags: {
        relationId: father.relationId,
        legalGuardian: father.legalGuardian,
        portalAccess: false,
        receivesNotifications: true,
        primaryContact: father.primaryContact,
        emergencyContact: father.emergencyContact,
        residence: father.residence,
        pickup: father.pickup,
      },
    });
    const probe = await office.attendance.day({});
    // The fifth school day back: the register, notice, report and follow-up
    // suites take the four after it.
    const date = schoolDayBack(runDay(probe.today), 5);
    const { rows } = await office.attendance.board({ date });
    const registers = await Promise.all(
      rows
        .filter((row) => row.daily)
        .map((row) =>
          office.attendance.register({
            classId: row.classId,
            date,
            periodId: row.periodId,
          }),
        ),
    );
    const homeroom = registers.find((register) =>
      register.students.some((row) => row.id === me.id),
    );
    if (!homeroom) throw new Error("the seeded student has no homeroom");
    const marks = (meaning: "absent" | "present") =>
      homeroom.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? meaning : ("present" as const),
      }));
    const absent = await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: periodOf(homeroom).id,
      expectedVersion: homeroom.register?.version ?? 0,
      marks: marks("absent"),
    });
    const texts = await office.notifications.deliveries({
      channel: "sms",
      q: father.fullNameEn ?? "",
    });
    expect(
      texts.rows.some(
        (row) => row.userId === father.userId && row.kind === "absence",
      ),
    ).toBe(true);
    await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: periodOf(homeroom).id,
      expectedVersion: absent.version,
      marks: marks("present"),
      correction: "Marked absent by mistake.",
    });
  });
});

describe("texts at a school without them", () => {
  test("plan no text, offer none in the log or the settings, and a text planned before the school turned them off is not sent", async () => {
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const school = tenants[0]?.schools.find((row) => row.slug === "northwind");
    if (!school) throw new Error("no northwind school");
    const family = await mother();
    const parent = await family.identity.currentUser();
    const asWorker = {
      tenantId,
      requestId: crypto.randomUUID(),
      actor: { kind: "system" as const },
    };
    /** Tells the parent of an absence as a school with a texting gateway would. */
    const tell = (title: string) =>
      cell.withWorker(asWorker, "write", async (tx) => {
        const scope = await workerScope(workerModules(), {
          tx,
          tenantId,
          schoolId: school.id,
        });
        if (!scope) throw new Error("the school is not in the directory");
        return notifyIn(
          {
            ...scope,
            actorUserId: null,
            now: new Date(),
            channels: { email: true, sms: true },
          },
          [parent.id],
          {
            kind: "absence",
            subject: { type: "user", id: parent.id },
            params: { title },
          },
        );
      });
    const textsOf = (title: string) =>
      cell.withWorker(asWorker, "read", (tx) =>
        tx.execute<{ state: string; reason: string | null }>(sql`
          select d.state, d.reason from core.notification_deliveries d
          join core.notifications n on n.tenant_id = d.tenant_id and n.id = d.notification_id
            and n.created_at = d.notification_created_at
          where d.tenant_id = ${tenantId}::uuid and d.channel = 'sms'
            and n.params ->> 'title' = ${title}`),
      );

    // Quiet hours would hold the text past the run, whatever time it is.
    const kept = await family.notifications.preferences();
    await family.notifications.savePreferences({
      preferences: { ...kept.preferences, quietFrom: "", quietTo: "" },
      locale: kept.locale,
    });
    await tell("Planned with texts on");
    expect(await textsOf("Planned with texts on")).toHaveLength(1);
    const texts = new MemoryProvider();
    await withoutModules("northwind", ["sms"], async () => {
      await tell("Planned with texts off");
      expect(await textsOf("Planned with texts off")).toEqual([]);
      const office = await principal();
      expect(
        (await office.notifications.deliveries({ channel: "sms" })).sms,
      ).toBe(false);
      expect((await family.notifications.preferences()).texts).toBe(false);
      await deliverTenant(
        cell,
        { email: null, sms: texts },
        tenantId,
        workerModules(),
      );
    });
    expect(texts.sent).toEqual([]);
    expect(await textsOf("Planned with texts on")).toEqual([
      { state: "skipped", reason: "module_off" },
    ]);
    await family.notifications.savePreferences({
      preferences: kept.preferences,
      locale: kept.locale,
    });
  });
});
