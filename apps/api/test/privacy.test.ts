import { withPurpose } from "@faridalms/database/context";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { login, raw, rejection, seeded, sessionFor, signedIn } from "./harness";

const names = (en: string, ar: string) => ({
  en: { given: en.split(" ")[0], family: en.split(" ").slice(1).join(" ") },
  ar: { given: ar.split(" ")[0], family: ar.split(" ").slice(1).join(" ") },
});

let pastYearId: string | undefined;

/**
 * Adds a student whose only school year ended on 30 June 2020, after
 * `meanwhile` has done what needs them still at the school.
 */
async function leaver(
  api: Awaited<ReturnType<typeof signedIn>>,
  reference = "NO9301",
  meanwhile: (studentId: string) => Promise<void> = async () => {},
) {
  const created = await api.people.saveStudent({
    names: names("Salama Leaver", "سلامة المغادر"),
    reference,
    birthDate: "2002-05-20",
  });
  await meanwhile(created.id);
  pastYearId ??= (
    await api.years.save({
      titleEn: "2019–2020",
      titleAr: "",
      startsOn: "2019-09-01",
      endsOn: "2020-06-30",
      terms: [],
    })
  ).id;
  const { cell, tenants } = seeded();
  const tenantId = tenants[0]?.tenantId ?? "";
  await cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx) => {
      await tx.execute(sql`
        insert into core.student_school_years (tenant_id, student_user_id, org_id,
          school_year_id, valid_during, source)
        select ${tenantId}::uuid, ${created.id}::uuid, y.org_id, y.id,
          daterange('2019-09-01', '2020-07-01'), 'manual'
        from core.academic_sessions y
        where y.tenant_id = ${tenantId}::uuid and y.id = ${pastYearId}::uuid`);
      // A leaver's student role ended with their last year; left open, they
      // would still count among the working year's students.
      await tx.execute(sql`
        update core.user_roles set valid_during = daterange('2019-09-01', '2020-07-01')
        where tenant_id = ${tenantId}::uuid and user_id = ${created.id}::uuid
          and role = 'student'`);
    },
  );
  return created.id;
}

describe("retention review", () => {
  test("a leaver comes up under the school's rules, and a legal hold blocks them until released", async () => {
    const api = await signedIn("northwind", login("principal"));
    const id = await leaver(api);

    const before = await api.privacy.overview();
    const listed = before.review.find((row) => row.userId === id);
    expect(listed).toMatchObject({
      kind: "student",
      leftOn: "2020-06-30",
      dueOn: null,
      block: null,
    });

    await api.privacy.saveRetention({
      studentRule: "years_after_leaving",
      studentValue: 5,
      staffYears: 6,
      applicantMonths: null,
    });
    const ruled = await api.privacy.overview();
    expect(ruled.rules).toEqual({
      studentRule: "years_after_leaving",
      studentValue: 5,
      staffYears: 6,
      applicantMonths: null,
    });
    expect(ruled.review.find((row) => row.userId === id)?.dueOn).toBe(
      "2025-06-30",
    );

    await api.privacy.saveRetention({
      studentRule: "until_age",
      studentValue: 25,
      staffYears: 6,
      applicantMonths: null,
    });
    expect(
      (await api.privacy.overview()).review.find((row) => row.userId === id)
        ?.dueOn,
    ).toBe("2027-05-20");

    const { id: holdId } = await api.privacy.placeHold({
      subjectUserId: id,
      reason: "Records requested by the education directorate.",
    });
    const held = await api.privacy.overview();
    expect(held.review.find((row) => row.userId === id)?.block).toEqual({
      kind: "hold",
      reason: "Records requested by the education directorate.",
    });
    expect(held.holds.map((row) => row.id)).toContain(holdId);

    await api.privacy.releaseHold({ id: holdId });
    const released = await api.privacy.overview();
    expect(released.review.find((row) => row.userId === id)?.block).toBeNull();
    expect(released.holds.map((row) => row.id)).not.toContain(holdId);
    expect(
      await rejection(api.privacy.releaseHold({ id: holdId })),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.hold_unknown" });
  });

  test("only those who keep the register reach it, and a hold names someone the school has had", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.privacy.overview())).toMatchObject({
      code: "FORBIDDEN",
    });
    const api = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        api.privacy.placeHold({
          subjectUserId: crypto.randomUUID(),
          reason: "A claim was filed.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.person_unknown" });
    expect(
      await rejection(
        api.privacy.saveRetention({
          studentRule: "until_age",
          studentValue: 16,
          staffYears: null,
          applicantMonths: null,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a records request runs on its law's clock and blocks erasure while open", async () => {
    const api = await signedIn("northwind", login("principal"));
    const { review } = await api.privacy.overview();
    const subject = review[0];
    if (!subject) throw new Error("the first test leaves a leaver");
    const base = {
      subjectUserId: subject.userId,
      requestedBy: "Salama Ashoush",
      relation: "self" as const,
      kind: "access" as const,
      receivedOn: "2026-03-02",
      clockFrom: "2026-03-02",
      dueOn: null,
      details: "",
    };

    const uk = await api.privacy.saveRequest({ ...base, law: "uk_gdpr" });
    expect(uk.dueOn).toBe("2026-04-02");
    const us = await api.privacy.saveRequest({ ...base, law: "ferpa" });
    expect(us.dueOn).toBe("2026-04-16");
    expect(
      await rejection(
        api.privacy.saveRequest({ ...base, law: "other", kind: "objection" }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const blocked = await api.privacy.overview();
    expect(
      blocked.review.find((row) => row.userId === subject.userId)?.block,
    ).toEqual({ kind: "request", dueOn: "2026-04-02" });

    expect(
      await api.privacy.extendRequest({
        id: uk.id,
        reason: "Records span several systems.",
      }),
    ).toEqual({ extendedTo: "2026-06-02" });
    expect(
      await rejection(
        api.privacy.extendRequest({ id: us.id, reason: "Complex." }),
      ),
    ).toMatchObject({ message: "privacy.no_extension" });
    const read = (await api.privacy.overview()).requests.find(
      (row) => row.id === uk.id,
    );
    const edited = await api.privacy.saveRequest({
      ...base,
      id: uk.id,
      expectedVersion: read?.version ?? 0,
      law: "uk_gdpr",
      details: "Asked for exam scripts too.",
    });
    expect(edited.dueOn).toBe("2026-04-02");
    // A change made from what was read before the last one is refused.
    expect(
      await rejection(
        api.privacy.saveRequest({
          ...base,
          id: uk.id,
          expectedVersion: read?.version ?? 0,
          law: "uk_gdpr",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });
    expect(
      (await api.privacy.overview()).requests.find((row) => row.id === uk.id)
        ?.extendedTo,
    ).toBe("2026-06-02");

    for (const id of [uk.id, us.id])
      await api.privacy.closeRequest({
        id,
        outcome: "completed",
        note: "Copies sent by email.",
      });
    const closed = await api.privacy.overview();
    expect(
      closed.review.find((row) => row.userId === subject.userId)?.block,
    ).toBeNull();
    expect(closed.requests.find((row) => row.id === uk.id)?.outcome).toBe(
      "completed",
    );
    expect(
      await rejection(
        api.privacy.closeRequest({
          id: uk.id,
          outcome: "withdrawn",
          note: "Again.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.request_closed" });
  });

  test("a breach is told to whom its law requires before it can be closed", async () => {
    const api = await signedIn("northwind", login("principal"));
    const { id } = await api.privacy.saveBreach({
      title: "Report cards emailed to the wrong family",
      description: "One family received another child's term report.",
      discoveredAt: "2026-10-01T08:00:00.000Z",
      law: "egypt",
      risk: "unlikely",
      peopleAffected: 1,
    });
    const logged = (await api.privacy.overview()).breaches.find(
      (row) => row.id === id,
    );
    expect(logged).toMatchObject({
      regulatorRequired: true,
      regulatorDueAt: "2026-10-04T08:00:00.000Z",
      peopleRequired: true,
    });
    expect((logged?.peopleDueOn ?? "") > "2026-10-01").toBe(true);

    expect(
      await rejection(
        api.privacy.closeBreach({ id, actions: "Emails now checked twice." }),
      ),
    ).toMatchObject({ message: "privacy.breach_notices_open" });
    expect(
      await rejection(
        api.privacy.breachNotices({
          id,
          regulatorNotifiedAt: "2026-10-02T10:00:00.000Z",
          regulatorReference: null,
          regulatorReason: "Not needed.",
          peopleNotifiedAt: null,
          peopleReason: null,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    await api.privacy.breachNotices({
      id,
      regulatorNotifiedAt: "2026-10-02T10:00:00.000Z",
      regulatorReference: "PDPC-2026-0042",
      regulatorReason: null,
      peopleNotifiedAt: "2026-10-02T12:00:00.000Z",
      peopleReason: null,
    });
    await api.privacy.closeBreach({ id, actions: "Emails now checked twice." });
    const closed = (await api.privacy.overview()).breaches.find(
      (row) => row.id === id,
    );
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.regulatorReference).toBe("PDPC-2026-0042");
    expect(
      await rejection(api.privacy.closeBreach({ id, actions: "Again." })),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.breach_closed" });
  });
});

/**
 * Runs as the principal holding erasure for a while. Nobody may grant what
 * they do not hold, so the role and its assignment are made as an operator
 * makes the first one, then ended.
 */
async function withErasure(
  run: (api: Awaited<ReturnType<typeof signedIn>>) => Promise<void>,
) {
  const api = await signedIn("northwind", login("principal"));
  const me = await api.identity.currentUser();
  const role = await api.access.saveRole({
    nameEn: `Data protection officer ${crypto.randomUUID().slice(0, 8)}`,
    capabilities: ["privacy:manage"],
  });
  const { cell, tenants } = seeded();
  const tenantId = tenants[0]?.tenantId ?? "";
  const operator = (statement: ReturnType<typeof sql>) =>
    cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "operator" } },
      "write",
      (tx) => tx.execute(statement),
    );
  await operator(sql`
    update core.access_roles set capabilities = capabilities || array['erasure:approve']
    where tenant_id = ${tenantId}::uuid and id = ${role.id}::uuid`);
  await operator(sql`
    insert into core.access_role_assignments (tenant_id, user_id, access_role_id, org_id, valid_during, reason)
    select ${tenantId}::uuid, ${me.id}::uuid, ${role.id}::uuid,
           coalesce(r.org_id, (select u.org_id from core.user_roles u
                               where u.tenant_id = r.tenant_id and u.user_id = ${me.id}::uuid
                                 and u.role = 'principal' and u.status = 'active' limit 1)),
           daterange(current_date - 1, null),
           'Approves erasures for the school.'
    from core.access_roles r where r.tenant_id = ${tenantId}::uuid and r.id = ${role.id}::uuid`);
  try {
    await run(await signedIn("northwind", login("principal")));
  } finally {
    await operator(sql`
      update core.access_role_assignments set valid_during = daterange(lower(valid_during), current_date)
      where tenant_id = ${tenantId}::uuid and access_role_id = ${role.id}::uuid`);
  }
}

describe("erasure", () => {
  test("an approved leaver is erased as the retention role, leaving proof and no personal data", async () => {
    await withErasure(async (api) => {
      const id = await leaver(api, "NO9311");
      await api.privacy.saveRetention({
        studentRule: "years_after_leaving",
        studentValue: 1,
        staffYears: null,
        applicantMonths: null,
      });
      const teacher = await signedIn("northwind", login("teacher"));
      expect(
        await rejection(
          teacher.privacy.approveErasure({
            subjectUserId: id,
            basis: "retention_schedule",
            requestId: null,
            reference: null,
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });

      const approved = await api.privacy.approveErasure({
        subjectUserId: id,
        basis: "retention_schedule",
        requestId: null,
        reference: null,
      });
      expect(approved.id).toBeString();
      const { counts } = await api.privacy.runErasure({ subjectUserId: id });
      expect(counts).toMatchObject({
        users: 1,
        student_school_years: 1,
        external_ids: 1,
      });

      const { cell, tenants } = seeded();
      const tenantId = tenants[0]?.tenantId ?? "";
      const [row] = await cell.withWorker(
        { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
        "read",
        (tx) =>
          tx.execute<{
            names: number;
            erased: boolean;
            status: string;
            ids: number;
          }>(sql`
            select num_nonnulls(full_name_en, full_name_ar, given_name_en, birth_date)::int as names,
                   erased_at is not null as erased, status,
                   (select count(*)::int from core.external_ids e
                     where e.tenant_id = u.tenant_id and e.user_id = u.id) as ids
            from core.users u where tenant_id = ${tenantId}::uuid and id = ${id}::uuid`),
      );
      expect(row).toEqual({
        names: 0,
        erased: true,
        status: "tobedeleted",
        ids: 0,
      });

      const after = await api.privacy.overview();
      expect(after.review.map((item) => item.userId)).not.toContain(id);
      expect(
        after.erasures.find((item) => item.subjectUserId === id)?.erasedAt,
      ).not.toBeNull();
      expect(
        await rejection(api.privacy.runErasure({ subjectUserId: id })),
      ).toMatchObject({ code: "CONFLICT", message: "privacy.erased" });
    });
  });

  test("takes the medical reports of the leaver's health records, row and bytes", async () => {
    await withErasure(async (api) => {
      const office = await sessionFor("northwind", login("principal"));
      const { tenantId } = seeded().tenants[0] ?? { tenantId: "" };
      let fileId = "";
      const id = await leaver(api, "NO9313", async (studentId) => {
        const { kinds } = await office.api.records.health({ studentId });
        const kind = kinds.find((row) => row.code === "chronic_condition");
        if (!kind) throw new Error("the seed has the condition kind");
        const { id: recordId } = await office.api.records.saveHealth({
          studentId,
          kindId: kind.id,
          hasAlert: false,
          text: "Epilepsy",
        });
        const body = new TextEncoder().encode("%PDF-1.4\nSeizure plan.\n");
        const file = await office.api.files.initiate({
          purpose: "health_report",
          name: "Seizure plan.pdf",
          mediaType: "application/pdf",
          sizeBytes: body.byteLength,
        });
        const put = await raw(
          "northwind",
          office.token,
          `/v1/files/${file.id}/content`,
          { method: "PUT", body },
        );
        expect(put.status).toBe(200);
        const record = (
          await office.api.records.health({ studentId })
        ).records.find((row) => row.id === recordId);
        if (!record) throw new Error("the record is kept");
        await office.api.records.attachHealthReport({
          studentId,
          recordId,
          expectedVersion: record.version,
          report: { fileId: file.id, name: file.name },
          shared: false,
        });
        fileId = file.id;
      });
      await api.privacy.saveRetention({
        studentRule: "years_after_leaving",
        studentValue: 1,
        staffYears: null,
        applicantMonths: null,
      });
      const { cell, files } = seeded();
      const unit = {
        tenantId,
        requestId: crypto.randomUUID(),
        actor: { kind: "system" as const },
      };
      const keyOf = async () => {
        const [row] = await cell.withWorker(unit, "read", (tx) =>
          withPurpose(tx, "health", (inner) =>
            inner.execute<{ storage_key: string }>(sql`
              select storage_key from core.files
              where tenant_id = ${tenantId}::uuid and id = ${fileId}::uuid`),
          ),
        );
        return row?.storage_key ?? null;
      };
      const key = await keyOf();
      if (!key) throw new Error("the report is stored");
      expect(await files.open(key)).not.toBeNull();

      const approved = await api.privacy.approveErasure({
        subjectUserId: id,
        basis: "retention_schedule",
        requestId: null,
        reference: null,
      });
      expect(approved.files).toBeGreaterThanOrEqual(1);
      const { counts } = await api.privacy.runErasure({ subjectUserId: id });
      expect(counts.health_records).toBe(1);
      expect(counts.files).toBeGreaterThanOrEqual(1);
      expect(await keyOf()).toBeNull();
      expect(await files.open(key)).toBeNull();
    });
  });

  test("a hold or an unfinished date refuses the approval", async () => {
    await withErasure(async (api) => {
      const id = await leaver(api, "NO9312");
      await api.privacy.saveRetention({
        studentRule: "years_after_leaving",
        studentValue: 20,
        staffYears: null,
        applicantMonths: null,
      });
      expect(
        await rejection(
          api.privacy.approveErasure({
            subjectUserId: id,
            basis: "retention_schedule",
            requestId: null,
            reference: null,
          }),
        ),
      ).toMatchObject({ message: "privacy.not_yet_due" });
      await api.privacy.placeHold({ subjectUserId: id, reason: "A claim." });
      expect(
        await rejection(
          api.privacy.approveErasure({
            subjectUserId: id,
            basis: "regulator_order",
            requestId: null,
            reference: "Order 12/2026",
          }),
        ),
      ).toMatchObject({ code: "CONFLICT", message: "privacy.erasure_held" });
      expect(
        await rejection(api.privacy.runErasure({ subjectUserId: id })),
      ).toMatchObject({ message: "privacy.erasure_not_approved" });
    });
  });
});
