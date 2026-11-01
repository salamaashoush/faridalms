import { emptyContent } from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { MIGRATIONS } from "../src/migrate";
import {
  approveErasure,
  contactErasurePlan,
  eraseContact,
} from "../src/stores/erasure";
import { harness, probe, urlFor } from "./harness";

/** The part of the conversations migration that moves rows, which a test may run again. */
async function moveIntoMessages() {
  const folder = (await readdir(MIGRATIONS.cell)).find((name) =>
    name.endsWith("_conversations_access"),
  );
  if (!folder) throw new Error("the conversations migration is missing");
  const text = await Bun.file(
    join(MIGRATIONS.cell, folder, "migration.sql"),
  ).text();
  return text.slice(text.indexOf("create or replace function pg_temp.e164"));
}

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness().su.unsafe(text, params)) as T[];
}

describe("the move of enquiry threads and logged calls into Messages", () => {
  test("an enquiry's thread becomes its conversation in the admissions mailbox, once", async () => {
    const { su, a, fixtures } = harness();
    const legacy = fixtures.get(a.tenantId)?.legacyEnquiry;
    if (!legacy) throw new Error("the fixture keeps a legacy enquiry");
    const move = await moveIntoMessages();
    await su.unsafe(move);
    await su.unsafe(move);

    const [enquiry] = await rows<{
      thread_id: string | null;
      phone_normalized: string | null;
    }>(
      "select thread_id, phone_normalized from core.site_enquiries where id = $1",
      [legacy],
    );
    expect(enquiry?.thread_id).toBeTruthy();
    expect(enquiry?.phone_normalized).toBe("+201005550177");
    const [thread] = await rows<{
      kind: string;
      mailbox: string;
      subject: string;
    }>(
      "select kind, mailbox, subject from core.message_threads where id = $1",
      [enquiry?.thread_id],
    );
    expect(thread).toMatchObject({ kind: "mailbox", mailbox: "admissions" });
    expect(thread?.subject).toStartWith("Your visit to ");
    const members = await rows<{
      email: string | null;
      role: string;
      user_id: string | null;
    }>(
      `select c.email, m.role, m.user_id from core.thread_members m
       left join core.message_contacts c on c.tenant_id = m.tenant_id and c.id = m.contact_id
       where m.thread_id = $1 order by m.role`,
      [enquiry?.thread_id],
    );
    expect(members.map((row) => row.role)).toEqual(["member", "owner"]);
    expect(members[0]?.email).toBe("salama.legacy@example.com");

    const entries = await rows<{
      kind: string;
      body: string;
      details: Record<string, unknown>;
      has_document: boolean;
    }>(
      `select x.kind, x.body, x.details, exists (select 1 from core.documents d
         where d.host_type = 'message' and d.host_id = x.id and d.frozen_at is not null) as has_document
       from core.messages x where x.thread_id = $1 order by x.created_at, x.id`,
      [enquiry?.thread_id],
    );
    expect(entries.map((row) => row.kind)).toEqual([
      "call",
      "note",
      "message",
      "event",
    ]);
    expect(entries[0]?.body).toBe("Asked about a visit.");
    expect(entries[2]?.body).toBe("Dear Salama, Tuesday at ten suits us.");
    expect(entries[3]?.details).toMatchObject({
      event: "state",
      from: "open",
      to: "in_progress",
      automatic: true,
    });
    expect(entries.slice(0, 3).every((row) => row.has_document)).toBe(true);
    expect(
      entries.every(
        (row) =>
          typeof row.details.migratedFrom === "string" || row.kind === "call",
      ),
    ).toBe(true);
  });

  test("a logged attendance call becomes a call in the office's conversation with the family", async () => {
    const { su, a } = harness();
    await su.unsafe(await moveIntoMessages());
    const calls = await rows<{
      mailbox: string;
      outcome: string;
      on: string;
      student: string;
    }>(
      `select t.mailbox, x.details ->> 'outcome' as outcome, x.details ->> 'on' as on,
         x.details ->> 'studentId' as student
       from core.messages x join core.message_threads t on t.id = x.thread_id
       where x.tenant_id = $1 and x.kind = 'call' and x.details ? 'studentId'`,
      [a.tenantId],
    );
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      mailbox: "attendance",
      outcome: "no_answer",
      on: "2026-11-02",
    });
  });

  test("every school was given the office's replies as message templates", async () => {
    const { a } = harness();
    const templates = await rows<{ n: number }>(
      `select count(*)::int as n from core.document_templates g
       join core.documents d on d.host_type = 'document_template' and d.host_id = g.id
       where g.tenant_id = $1 and g.kind = 'message' and g.builtin_key is not null
         and g.owner_user_id is null`,
      [a.tenantId],
    );
    expect(templates[0]?.n).toBe(10 * a.schoolIds.length);
  });
});

describe("conversations under row security", () => {
  test("only messages are searchable; a staff note never enters the index", async () => {
    const { a } = harness();
    const found = await rows<{ kind: string }>(
      `select x.kind from search.entries e join core.messages x on x.id = e.entity_id
       where e.tenant_id = $1 and e.entity_type = 'message' group by x.kind`,
      [a.tenantId],
    );
    expect(found.map((row) => row.kind)).toEqual(["message"]);
    const documents = await rows<{ n: number }>(
      `select count(*)::int as n from search.entries e
       join core.documents d on d.id = e.entity_id
       where e.tenant_id = $1 and e.entity_type = 'document' and d.host_type = 'message'`,
      [a.tenantId],
    );
    expect(documents[0]?.n).toBe(0);
  });

  test("retention empties no message, contact or enquiry without an approved erasure", async () => {
    const { a } = harness();
    for (const text of [
      "update core.messages set body = '', details = '{}', redacted_at = now()",
      "update core.message_contacts set status = 'tobedeleted', email = null",
      "update core.site_enquiries set status = 'tobedeleted', name = '-'",
      "update core.message_threads set status = 'tobedeleted', subject = null",
    ]) {
      const result = await probe("retention", a.tenantId, [
        { text: `${text} returning 1` },
      ]);
      expect(result.error).toBeUndefined();
      expect(result.count).toBe(0);
    }
  });

  test("an outside contact's address is unique in a school, in lower case", async () => {
    const { a } = harness();
    const add = (email: string) =>
      probe("app", a.tenantId, [
        {
          text: `insert into core.message_contacts (tenant_id, email, display_name)
                 values ($1, $2, 'Salama Ashoush')`,
          params: [a.tenantId, email],
        },
        {
          text: `insert into core.message_contacts (tenant_id, email, display_name)
                 values ($1, $2, 'Salama Ashoush')`,
          params: [a.tenantId, email],
        },
      ]);
    expect((await add("twice@example.com")).error?.code).toBe("23505");
    expect((await add("Upper@Example.com")).error?.code).toBe("23514");
  });
});

describe("erasing an outside contact", () => {
  test("empties their conversation, their enquiry and their address, keeping each entry in its place", async () => {
    const { su, a, fixtures } = harness();
    await su.unsafe(await moveIntoMessages());
    const legacy = fixtures.get(a.tenantId)?.legacyEnquiry;
    const t = a.tenantId;
    const client = new SQL(urlFor(null));
    const db = drizzle({ client });
    const rollback = new Error("rolled back");
    let checked = false;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select app.begin_unit(${t}::uuid, null, null, null, 'probe', 'system')`,
        );
        const [found] = await tx.execute<{
          contact: string;
          thread: string;
          author: string;
        }>(sql`
          select m.contact_id as contact, e.thread_id as thread, e.created_by_user_id as author
          from core.site_enquiries e
          join core.thread_members m on m.tenant_id = e.tenant_id and m.thread_id = e.thread_id
            and m.contact_id is not null
          where e.tenant_id = ${t}::uuid and e.id = ${legacy}::uuid`);
        if (!found) throw new Error("the legacy enquiry has no contact");
        const plan = await contactErasurePlan(tx, {
          tenantId: t,
          contactId: found.contact,
        });
        expect(plan.threads).toEqual([found.thread]);
        expect(plan.enquiries).toEqual([legacy ?? ""]);
        expect(plan.documents.length).toBeGreaterThan(0);
        await approveErasure(tx, {
          tenantId: t,
          subjectUserId: null,
          subjectContactId: found.contact,
          basis: "data_subject_request",
          requestReference: "Asked by phone",
          approvedByUserId: found.author,
          plan,
        });
        await tx.execute(sql`set local role retention`);
        await tx.execute(
          sql`select app.begin_unit(${t}::uuid, null, null, null, 'probe', 'system')`,
        );
        const result = await eraseContact(tx, {
          tenantId: t,
          contactId: found.contact,
          emptyContent: emptyContent(),
        });
        await tx.execute(sql`reset role`);
        expect(result.counts.message_contacts).toBe(1);
        expect(result.counts.site_enquiries).toBe(1);
        const [after] = await tx.execute<{
          email: string | null;
          name: string;
          words: number;
          entries: number;
          documents: number;
          enquiry: string;
        }>(sql`
          select (select email from core.message_contacts where tenant_id = ${t}::uuid and id = ${found.contact}::uuid) as email,
                 (select display_name from core.message_contacts where tenant_id = ${t}::uuid and id = ${found.contact}::uuid) as name,
                 (select count(*)::int from core.messages where tenant_id = ${t}::uuid
                   and thread_id = ${found.thread}::uuid and body <> '') as words,
                 (select count(*)::int from core.messages where tenant_id = ${t}::uuid
                   and thread_id = ${found.thread}::uuid) as entries,
                 (select count(*)::int from core.documents d join core.messages x on x.id = d.host_id
                   where d.tenant_id = ${t}::uuid and d.host_type = 'message'
                     and x.thread_id = ${found.thread}::uuid and d.plain_text <> '') as documents,
                 (select name from core.site_enquiries where tenant_id = ${t}::uuid and id = ${legacy}::uuid) as enquiry`);
        expect(after).toMatchObject({
          email: null,
          name: "",
          words: 0,
          documents: 0,
          enquiry: "-",
        });
        expect(after?.entries).toBeGreaterThan(0);
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await client.close();
    }
    expect(checked).toBe(true);
  });
});
