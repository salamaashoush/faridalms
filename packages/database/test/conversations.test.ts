import { contentPlainText } from "@faridalms/domain/content";
import {
  emptyContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import { saveDocument } from "../src/stores/documents";
import { openEnquiryConversation } from "../src/stores/enquiries";
import {
  approveErasure,
  contactErasurePlan,
  eraseContact,
} from "../src/stores/erasure";
import {
  contactFor,
  mergeContacts,
  postMessage,
  replyTarget,
} from "../src/stores/messages";
import { harness, probe, urlFor } from "./harness";

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness().su.unsafe(text, params)) as T[];
}

let opening: Promise<{ enquiry: string; thread: string }> | undefined;
/**
 * The fixture's logged enquiry with its conversation in the admissions
 * mailbox: the call it was logged as, a note, the office's reply, each with
 * its document, and a change of state.
 */
function conversation() {
  opening ??= (async () => {
    const { a, fixtures } = harness();
    const t = a.tenantId;
    const enquiry = fixtures.get(t)?.loggedEnquiry;
    if (!enquiry) throw new Error("the fixture keeps a logged enquiry");
    const client = new SQL(urlFor(null));
    try {
      return await drizzle({ client }).transaction(async (tx) => {
        await tx.execute(
          sql`select app.begin_unit(${t}::uuid, null, null, null, 'probe', 'system')`,
        );
        const thread = await openEnquiryConversation(tx, {
          tenantId: t,
          enquiryId: enquiry,
        });
        const [found] = await tx.execute<{ org_id: string; author: string }>(
          sql`select org_id, created_by_user_id as author from core.site_enquiries
              where tenant_id = ${t}::uuid and id = ${enquiry}::uuid`,
        );
        if (!thread || !found)
          throw new Error("the enquiry has no conversation");
        for (const [kind, words] of [
          ["note", "Prefers mornings."],
          ["message", "Dear Salama, Tuesday at ten suits us."],
        ] as const) {
          const posted = await postMessage(tx, {
            tenantId: t,
            threadId: thread,
            kind,
            authorId: found.author,
            body: words,
          });
          const content = plainContent(words);
          await saveDocument(tx, {
            tenantId: t,
            orgId: found.org_id,
            host: { type: "message", id: posted.id },
            content: content as unknown as Record<string, unknown>,
            plainText: contentPlainText(content),
            mediaIds: [],
            userId: found.author,
            frozen: true,
          });
        }
        await postMessage(tx, {
          tenantId: t,
          threadId: thread,
          kind: "event",
          authorId: null,
          body: "",
          details: { event: "state", from: "open", to: "in_progress" },
        });
        return { enquiry, thread };
      });
    } finally {
      await client.close();
    }
  })();
  return opening;
}

describe("the office's message templates", () => {
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
  test("a family finds messages alone; a staff note is found only as the team's", async () => {
    const { a } = harness();
    await conversation();
    const found = await rows<{ kind: string; result_type: string }>(
      `select x.kind, e.result_type from search.entries e join core.messages x on x.id = e.entity_id
       where e.tenant_id = $1 and e.entity_type = 'message'
       group by x.kind, e.result_type order by x.kind`,
      [a.tenantId],
    );
    expect(found.length).toBeGreaterThan(1);
    for (const row of found)
      expect([row.kind, row.result_type]).toEqual([
        row.kind,
        row.kind === "message" ? "message_thread" : "team_thread",
      ]);
    expect(found.some((row) => row.kind === "event")).toBe(false);
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
    const { enquiry } = await conversation();
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
          where e.tenant_id = ${t}::uuid and e.id = ${enquiry}::uuid`);
        if (!found) throw new Error("the enquiry has no contact");
        const plan = await contactErasurePlan(tx, {
          tenantId: t,
          contactId: found.contact,
        });
        expect(plan.threads).toEqual([found.thread]);
        expect(plan.enquiries).toEqual([enquiry]);
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
                 (select name from core.site_enquiries where tenant_id = ${t}::uuid and id = ${enquiry}::uuid) as enquiry`);
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
