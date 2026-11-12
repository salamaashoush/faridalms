import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { withPurpose } from "../src/context";
import { permittingLink } from "../src/stores/families";
import { guardianSummary } from "../src/stores/guardian-health";
import { insertHealthChange, summaryRecordsOf } from "../src/stores/records";
import { appCell, harness, probe } from "./harness";

const TODAY = "2026-11-01";

interface Link {
  id: string;
  student: string;
  related: string;
}

async function confirmedMother(tenantId: string): Promise<Link> {
  const [row] = (await harness().su.unsafe(
    `select r.id, r.student_user_id as student, r.related_user_id as related
     from core.user_relationships r
     where r.tenant_id = $1 and r.relation_meaning = 'mother' and r.status = 'active'
       and r.portal_access and r.legal_guardian and r.verified_at is not null
       and r.educational_rights = 'full' and not r.communication_isolated
       and exists (select 1 from health.records h
                   where h.tenant_id = r.tenant_id and h.student_user_id = r.student_user_id)
     order by r.created_at limit 1`,
    [tenantId],
  )) as Link[];
  if (!row)
    throw new Error(
      "the seed links a confirmed mother to a child with health records",
    );
  return row;
}

async function permits(
  tenantId: string,
  link: Link,
  change: string | null,
): Promise<Record<"follow" | "contact" | "health", boolean>> {
  const result = await probe<{
    follow: boolean;
    contact: boolean;
    health: boolean;
  }>("app", tenantId, [
    ...(change
      ? [
          {
            text: `update core.user_relationships set ${change} where tenant_id = $1 and id = $2`,
            params: [tenantId, link.id],
          },
        ]
      : []),
    {
      text: `select app.guardian_permits(r, $3::date, 'follow') as follow,
                    app.guardian_permits(r, $3::date, 'contact') as contact,
                    app.guardian_permits(r, $3::date, 'health') as health
             from core.user_relationships r where r.tenant_id = $1 and r.id = $2`,
      params: [tenantId, link.id, TODAY],
    },
  ]);
  if (result.error) throw new Error(result.error.message);
  const [row] = result.rows;
  if (!row) throw new Error("the link was not read back");
  return row;
}

const ROLLBACK = new Error("roll back");

/** Always rolled back, so the seed the other suites read stays as it was. */
async function rolledBack<T>(
  tenantId: string,
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T> {
  const cell = appCell();
  let result: T | undefined;
  try {
    await cell
      .withTenant(
        { tenantId, requestId: "guardians", actor: { kind: "system" } },
        "write",
        async (tx) => {
          result = await work(tx);
          throw ROLLBACK;
        },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
  } finally {
    await cell.close();
  }
  return result as T;
}

describe("the guardian predicate", () => {
  test("a confirmed legal guardian with portal access is permitted every purpose", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    expect(await permits(a.tenantId, link, null)).toEqual({
      follow: true,
      contact: true,
      health: true,
    });
  });

  test("a guardian the school cut off follows the child but is neither contacted nor shown their health", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    expect(
      await permits(a.tenantId, link, "communication_isolated = true"),
    ).toEqual({ follow: true, contact: false, health: false });
  });

  test("a guardian who is not a legal guardian, or not yet confirmed as one, is not shown the child's health", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    for (const change of [
      "legal_guardian = false",
      "legal_guardian = null",
      "verified_at = null",
    ])
      expect(await permits(a.tenantId, link, change)).toEqual({
        follow: true,
        contact: true,
        health: false,
      });
  });

  test("rights a court order limited, an ended link or no portal access withhold the medical summary", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    expect(
      (await permits(a.tenantId, link, "educational_rights = 'restricted'"))
        .health,
    ).toBe(false);
    expect(
      await permits(
        a.tenantId,
        link,
        `valid_during = daterange('2024-09-01', '${TODAY}')`,
      ),
    ).toEqual({ follow: false, contact: false, health: false });
    expect(
      await permits(
        a.tenantId,
        link,
        "portal_access = false, receives_notifications = false",
      ),
    ).toEqual({ follow: false, contact: false, health: false });
  });

  test("the school's notices go where the link takes them, and calls to any linked adult, but neither to one it cut off", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    const purposes = async (change: string | null) => {
      const result = await probe<{ notice: boolean; call: boolean }>(
        "app",
        a.tenantId,
        [
          ...(change
            ? [
                {
                  text: `update core.user_relationships set ${change} where tenant_id = $1 and id = $2`,
                  params: [a.tenantId, link.id],
                },
              ]
            : []),
          {
            text: `select app.guardian_permits(r, $3::date, 'notice') as notice,
                          app.guardian_permits(r, $3::date, 'call') as call
                   from core.user_relationships r where r.tenant_id = $1 and r.id = $2`,
            params: [a.tenantId, link.id, TODAY],
          },
        ],
      );
      if (result.error) throw new Error(result.error.message);
      return result.rows[0];
    };
    expect(await purposes("receives_notifications = true")).toEqual({
      notice: true,
      call: true,
    });
    expect(
      await purposes("receives_notifications = false, portal_access = false"),
    ).toEqual({ notice: false, call: true });
    expect(
      await purposes(
        "receives_notifications = true, communication_isolated = true",
      ),
    ).toEqual({ notice: false, call: false });
    expect(
      await purposes(`valid_during = daterange('2024-09-01', '${TODAY}')`),
    ).toEqual({ notice: false, call: false });
  });

  test("a purpose the rule does not know is an error, not a refusal", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    const result = await probe("app", a.tenantId, [
      {
        text: `select app.guardian_permits(r, $3::date, 'healht') from core.user_relationships r
               where r.tenant_id = $1 and r.id = $2`,
        params: [a.tenantId, link.id, TODAY],
      },
    ]);
    expect(result.error?.code).toBe("22023");
  });

  test("the predicate reads only the bound tenant's links", async () => {
    const { a, b } = harness();
    const link = await confirmedMother(a.tenantId);
    const result = await probe<{ n: number }>("app", b.tenantId, [
      {
        text: `select count(*)::int as n from core.user_relationships r
               where r.id = $1 and app.guardian_permits(r, $2::date, 'health')`,
        params: [link.id, TODAY],
      },
    ]);
    expect(result.rows[0]?.n).toBe(0);
  });
});

describe("the medical summary in the store", () => {
  test("a permitted guardian reads the child's records and may ask for a change", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    const seen = await rolledBack(a.tenantId, async (tx) => {
      const permitting = await permittingLink(tx, {
        tenantId: a.tenantId,
        viewerId: link.related,
        studentId: link.student,
        today: TODAY,
        purpose: "health",
      });
      const rows = await withPurpose(tx, "health", (inner) =>
        summaryRecordsOf(inner, {
          tenantId: a.tenantId,
          studentId: link.student,
          reader: guardianSummary({
            tenantId: a.tenantId,
            viewerId: link.related,
            today: TODAY,
          }),
          meanings: ["allergy", "blood_group"],
        }),
      );
      return { permitting, rows: rows.length };
    });
    expect(seen.permitting).toBe(link.id);
    expect(seen.rows).toBeGreaterThan(0);
  });

  test("a restricted or non-legal guardian reads nothing and nothing they ask for is kept", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    for (const change of [
      sql`communication_isolated = true`,
      sql`legal_guardian = false`,
    ]) {
      const seen = await rolledBack(a.tenantId, async (tx) => {
        await tx.execute(
          sql`update core.user_relationships set ${change}
              where tenant_id = ${a.tenantId}::uuid and id = ${link.id}::uuid`,
        );
        const permitting = await permittingLink(tx, {
          tenantId: a.tenantId,
          viewerId: link.related,
          studentId: link.student,
          today: TODAY,
          purpose: "health",
        });
        return withPurpose(tx, "health", async (inner) => {
          const reader = guardianSummary({
            tenantId: a.tenantId,
            viewerId: link.related,
            today: TODAY,
          });
          const rows = await summaryRecordsOf(inner, {
            tenantId: a.tenantId,
            studentId: link.student,
            reader,
            meanings: ["allergy", "blood_group"],
          });
          const [request] = await inner.execute<{ id: string }>(sql`
            insert into core.records_requests (tenant_id, org_id, subject_user_id, requested_by, relation,
              kind, law, received_on, clock_from, due_on, logged_by_user_id, topic)
            select ${a.tenantId}::uuid, s.org_id, ${link.student}::uuid, 'Salama Ashoush', 'parent',
              'correction', 'egypt', ${TODAY}::date, ${TODAY}::date, ${TODAY}::date, ${link.related}::uuid,
              'health'
            from core.student_school_years s
            where s.tenant_id = ${a.tenantId}::uuid and s.student_user_id = ${link.student}::uuid
            limit 1
            returning id`);
          const [key] = await inner.execute<{ key_version: number }>(sql`
            select key_version from core.tenant_keys
            where tenant_id = ${a.tenantId}::uuid and purpose = 'health' limit 1`);
          if (!request || !key) throw new Error("request and key expected");
          const kept = await insertHealthChange(inner, {
            tenantId: a.tenantId,
            id: Bun.randomUUIDv7(),
            requestId: request.id,
            studentId: link.student,
            requestedByUserId: link.related,
            reader,
            target: "contact",
            kindId: null,
            recordId: null,
            keyVersion: key.key_version,
            ciphertext: new Uint8Array(64),
          });
          return { permitting, rows: rows.length, kept };
        });
      });
      expect(seen).toEqual({ permitting: null, rows: 0, kept: false });
    }
  });
});

async function answers(
  tenantId: string,
  link: Link,
  change: string | null,
): Promise<Record<"consent" | "decide", boolean>> {
  const result = await probe<{ consent: boolean; decide: boolean }>(
    "app",
    tenantId,
    [
      ...(change
        ? [
            {
              text: `update core.user_relationships set ${change} where tenant_id = $1 and id = $2`,
              params: [tenantId, link.id],
            },
          ]
        : []),
      {
        text: `select app.guardian_permits(r, $3::date, 'consent') as consent,
                      app.guardian_permits(r, $3::date, 'decide') as decide
               from core.user_relationships r where r.tenant_id = $1 and r.id = $2`,
        params: [tenantId, link.id, TODAY],
      },
    ],
  );
  if (result.error) throw new Error(result.error.message);
  const [row] = result.rows;
  if (!row) throw new Error("the link was not read back");
  return row;
}

describe("who answers for a learner", () => {
  test("a confirmed legal guardian with full rights consents and decides", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    expect(await answers(a.tenantId, link, null)).toEqual({
      consent: true,
      decide: true,
    });
  });

  test("portal access and being cut off from contact change neither", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    for (const change of [
      "portal_access = false",
      "communication_isolated = true",
    ])
      expect(await answers(a.tenantId, link, change)).toEqual({
        consent: true,
        decide: true,
      });
  });

  test("a guardian not confirmed as a legal guardian decides but does not consent", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    for (const change of [
      "legal_guardian = false",
      "legal_guardian = null",
      "verified_at = null",
    ])
      expect(await answers(a.tenantId, link, change)).toEqual({
        consent: false,
        decide: true,
      });
  });

  test("rights a court order limited or an ended link take both away", async () => {
    const { a } = harness();
    const link = await confirmedMother(a.tenantId);
    for (const change of [
      "educational_rights = 'restricted'",
      "educational_rights = 'none', portal_access = false",
      `valid_during = daterange('2024-09-01', '${TODAY}')`,
      "status = 'tobedeleted'",
    ])
      expect(await answers(a.tenantId, link, change)).toEqual({
        consent: false,
        decide: false,
      });
  });
});
