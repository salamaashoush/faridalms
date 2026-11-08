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
import { contactFor, mergeContacts, replyTarget } from "../src/stores/messages";
import { harness, probe, urlFor } from "./harness";

async function migrationText(suffix: string) {
  const folder = (await readdir(MIGRATIONS.cell)).find((name) =>
    name.endsWith(suffix),
  );
  if (!folder) throw new Error(`the ${suffix} migration is missing`);
  return Bun.file(join(MIGRATIONS.cell, folder, "migration.sql")).text();
}

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness().su.unsafe(text, params)) as T[];
}

/**
 * The enquiry threads and logged calls as a release before conversations
 * kept them: both tables as their own migrations made them, which a later
 * one drops, and the rows such a release wrote for the fixture's legacy
 * enquiry and a child's absence.
 */
async function writeAsBefore() {
  const { su, a, fixtures } = harness();
  const legacy = fixtures.get(a.tenantId)?.legacyEnquiry;
  if (!legacy) throw new Error("the fixture keeps a legacy enquiry");
  for (const [suffix, table] of [
    ["_attendance_contacts", '"core"."attendance_contacts"'],
    ["_enquiry_record", '"core"."site_enquiry_entries"'],
  ] as const)
    for (const statement of (await migrationText(suffix)).split(
      "--> statement-breakpoint",
    ))
      if (statement.includes(table)) await su.unsafe(statement);
  const [enquiry] = await rows<{ org_id: string; author: string }>(
    "select org_id, created_by_user_id as author from core.site_enquiries where id = $1",
    [legacy],
  );
  const [link] = await rows<{ student: string }>(
    "select student_user_id as student from core.user_relationships where tenant_id = $1 order by id limit 1",
    [a.tenantId],
  );
  if (!enquiry || !link) throw new Error("the fixture has no family");
  await su.unsafe(
    `insert into core.site_enquiry_entries (tenant_id, org_id, enquiry_id, kind, body, details, author_user_id)
     values ($1, $2, $3, 'note', 'Prefers mornings.', '{}', $4),
            ($1, $2, $3, 'reply', 'Dear Salama, Tuesday at ten suits us.', '{"subject":"Visiting","locale":"en"}', $4),
            ($1, $2, $3, 'state', '', '{"from":"open","to":"in_progress","automatic":true}', $4)`,
    [a.tenantId, enquiry.org_id, legacy, enquiry.author],
  );
  await su.unsafe(
    `insert into core.attendance_contacts (tenant_id, org_id, student_user_id, day_on, outcome, recorded_by_user_id)
     values ($1, $2, $3, '2026-11-02', 'no_answer', $4)`,
    [a.tenantId, enquiry.org_id, link.student, enquiry.author],
  );
  return {
    legacy,
    schoolId: enquiry.org_id,
    author: enquiry.author,
    student: link.student,
  };
}

/** The part of the conversations migration that moves rows, which a test may run again. */
async function moveIntoMessages() {
  const text = await migrationText("_conversations_access");
  return text.slice(text.indexOf("create or replace function pg_temp.e164"));
}

let moving: Promise<Awaited<ReturnType<typeof writeAsBefore>>> | undefined;
/** The old rows written and moved into Messages, twice, as the move ran. */
function moved() {
  moving ??= (async () => {
    const written = await writeAsBefore();
    const move = await moveIntoMessages();
    await harness().su.unsafe(move);
    await harness().su.unsafe(move);
    return written;
  })();
  return moving;
}

let contracting: Promise<{ late: string; enquiry: string }> | undefined;
/**
 * What an older release wrote after the move, copied by the contract step,
 * twice, and the old tables dropped as the next migration drops them.
 */
function contracted() {
  contracting ??= (async () => {
    const { su, a } = harness();
    const { legacy, schoolId, author, student } = await moved();
    const late = Bun.randomUUIDv7();
    const enquiry = Bun.randomUUIDv7();
    await su.unsafe(
      `insert into core.site_enquiries (tenant_id, id, org_id, source, locale, purpose, name, email,
         phone, message, state)
       values ($1, $2, $3, 'website', 'ar', 'general', 'Salama Ashoush', 'salama.late@example.com',
         '', 'هل يوجد نقل مدرسي؟', 'open')`,
      [a.tenantId, enquiry, schoolId],
    );
    await su.unsafe(
      `insert into core.site_enquiry_entries (tenant_id, id, org_id, enquiry_id, kind, body, details, author_user_id)
       values ($1, $2, $3, $4, 'call', 'Called back, no answer.', '{}', $5),
              ($1, uuidv7(), $3, $6, 'note', 'Asked about the bus.', '{}', $5)`,
      [a.tenantId, late, schoolId, legacy, author, enquiry],
    );
    await su.unsafe(
      `insert into core.attendance_contacts (tenant_id, org_id, student_user_id, day_on, outcome, note, recorded_by_user_id)
       values ($1, $2, $3, '2026-11-03', 'reached', 'Spoke to the family.', $4)`,
      [a.tenantId, schoolId, student, author],
    );
    const contract = await migrationText("_conversation_contract");
    await su.unsafe(contract);
    await su.unsafe(contract);
    await su.unsafe(await migrationText("_conversation_contract_drop"));
    return { late, enquiry };
  })();
  return contracting;
}

describe("the move of enquiry threads and logged calls into Messages", () => {
  test("an enquiry's thread becomes its conversation in the admissions mailbox, once", async () => {
    const { legacy } = await moved();

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
    const { a } = harness();
    await moved();
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

  test("what an older release wrote after the move is copied once, then the old tables go", async () => {
    const { a } = harness();
    const { legacy } = await moved();
    const { late, enquiry } = await contracted();

    const copied = await rows<{
      thread_id: string;
      kind: string;
      body: string;
    }>(
      "select thread_id, kind, body from core.messages where details ->> 'migratedFrom' = $1",
      [late],
    );
    expect(copied.length).toBe(1);
    expect(copied[0]).toMatchObject({
      kind: "call",
      body: "Called back, no answer.",
    });
    const [old] = await rows<{ thread_id: string }>(
      "select thread_id from core.site_enquiries where id = $1",
      [legacy],
    );
    expect(copied[0]?.thread_id).toBe(old?.thread_id ?? "");

    const [opened] = await rows<{ thread_id: string | null }>(
      "select thread_id from core.site_enquiries where id = $1",
      [enquiry],
    );
    expect(opened?.thread_id).toBeTruthy();
    const entries = await rows<{
      kind: string;
      body: string;
      migrated: boolean;
      has_document: boolean;
    }>(
      `select x.kind, x.body, x.details ? 'migratedFrom' as migrated,
         exists (select 1 from core.documents d
           where d.host_type = 'message' and d.host_id = x.id and d.frozen_at is not null) as has_document
       from core.messages x where x.thread_id = $1 order by x.created_at, x.id`,
      [opened?.thread_id],
    );
    expect(entries.map((row) => [row.kind, row.body, row.migrated])).toEqual([
      ["message", "هل يوجد نقل مدرسي؟", false],
      ["note", "Asked about the bus.", true],
    ]);
    expect(entries.every((row) => row.has_document)).toBe(true);
    const [thread] = await rows<{ subject: string; mailbox: string }>(
      "select subject, mailbox from core.message_threads where id = $1",
      [opened?.thread_id],
    );
    expect(thread?.mailbox).toBe("admissions");
    expect(thread?.subject).toStartWith("رسالتكم إلى ");

    const calls = await rows<{ outcome: string; body: string; thread: string }>(
      `select x.details ->> 'outcome' as outcome, x.body, x.thread_id as thread
       from core.messages x
       where x.tenant_id = $1 and x.kind = 'call' and x.details ? 'studentId'
       order by x.created_at`,
      [a.tenantId],
    );
    expect(calls.map((row) => [row.outcome, row.body])).toEqual([
      ["no_answer", ""],
      ["reached", "Spoke to the family."],
    ]);
    expect(new Set(calls.map((row) => row.thread)).size).toBe(1);

    const [tables] = await rows<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'core'
         and tablename in ('site_enquiry_entries', 'attendance_contacts')`,
    );
    expect(tables?.n).toBe(0);
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
    const { a } = harness();
    const { legacy } = await moved();
    await contracted();
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
        expect(plan.enquiries).toEqual([legacy]);
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

describe("merging two contacts of one family", () => {
  test("keeps every conversation and entry, and erasing the one kept reaches the other", async () => {
    const { a } = harness();
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
        const [staff] = await tx.execute<{ user_id: string; org_id: string }>(
          sql`select user_id, org_id from core.user_roles where tenant_id = ${t}::uuid
              and role = 'principal' and status = 'active' limit 1`,
        );
        if (!staff) throw new Error("no principal");
        const [home, work] = await tx.execute<{ id: string }>(sql`
          insert into core.message_contacts (tenant_id, email, display_name)
          values (${t}::uuid, 'salama.home@example.com', 'Salama Ashoush'),
                 (${t}::uuid, 'salama.work@example.org', 'Salama Ashoush')
          returning id`);
        if (!home || !work) throw new Error("no contacts");
        const [both, alone] = await tx.execute<{ id: string }>(sql`
          insert into core.message_threads (tenant_id, org_id, kind, mailbox, subject)
          values (${t}::uuid, ${staff.org_id}::uuid, 'mailbox', 'admissions', 'Both'),
                 (${t}::uuid, ${staff.org_id}::uuid, 'mailbox', 'admissions', 'Alone')
          returning id`);
        if (!both || !alone) throw new Error("no threads");
        const key = Buffer.alloc(32, 7);
        await tx.execute(sql`
          insert into core.thread_members (tenant_id, thread_id, contact_id, role, reply_key)
          values (${t}::uuid, ${both.id}::uuid, ${home.id}::uuid, 'member', null),
                 (${t}::uuid, ${both.id}::uuid, ${work.id}::uuid, 'member', ${key}),
                 (${t}::uuid, ${alone.id}::uuid, ${work.id}::uuid, 'member', null)`);
        const [written] = await tx.execute<{ id: string }>(sql`
          insert into core.messages (tenant_id, thread_id, kind, author_contact_id, body)
          values (${t}::uuid, ${alone.id}::uuid, 'message', ${work.id}::uuid, 'From work.')
          returning id`);
        await tx.execute(sql`
          insert into core.notification_deliveries (tenant_id, contact_id, message_id, channel,
            address, locale, state, due_at)
          values (${t}::uuid, ${work.id}::uuid, ${written?.id}::uuid, 'email',
            'salama.work@example.org', 'en', 'pending', now())`);

        const merged = await mergeContacts(tx, {
          tenantId: t,
          fromId: work.id,
          intoId: home.id,
        });
        expect(merged).toMatchObject({
          merged: true,
          conversations: 2,
          entries: 1,
        });
        expect(
          await mergeContacts(tx, {
            tenantId: t,
            fromId: work.id,
            intoId: home.id,
          }),
        ).toEqual({ merged: false, reason: "merged" });
        const target = await replyTarget(tx, { tenantId: t, key });
        expect(target).toMatchObject({
          threadId: both.id,
          contactId: home.id,
          addresses: ["salama.home@example.com", "salama.work@example.org"],
        });
        const found = await contactFor(tx, {
          tenantId: t,
          email: "Salama.Work@example.org",
          phone: "",
          phoneNormalized: null,
          name: "Salama Ashoush",
          locale: "en",
        });
        expect(found.id).toBe(home.id);

        const plan = await contactErasurePlan(tx, {
          tenantId: t,
          contactId: home.id,
        });
        expect(plan.threads.toSorted()).toEqual([both.id, alone.id].toSorted());
        await approveErasure(tx, {
          tenantId: t,
          subjectUserId: null,
          subjectContactId: home.id,
          basis: "data_subject_request",
          requestReference: "Asked by phone",
          approvedByUserId: staff.user_id,
          plan,
        });
        await tx.execute(sql`set local role retention`);
        await tx.execute(
          sql`select app.begin_unit(${t}::uuid, null, null, null, 'probe', 'system')`,
        );
        const result = await eraseContact(tx, {
          tenantId: t,
          contactId: home.id,
          emptyContent: emptyContent(),
        });
        await tx.execute(sql`reset role`);
        expect(result.counts.message_contacts).toBe(2);
        expect(result.counts.notification_deliveries).toBe(1);
        const [after] = await tx.execute<{ emails: number; words: number }>(sql`
          select (select count(*)::int from core.message_contacts
                   where tenant_id = ${t}::uuid and id in (${home.id}::uuid, ${work.id}::uuid)
                     and email is not null) as emails,
                 (select count(*)::int from core.messages
                   where tenant_id = ${t}::uuid and thread_id = ${alone.id}::uuid and body <> '') as words`);
        expect(after).toEqual({ emails: 0, words: 0 });
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
