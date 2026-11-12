import { fileById } from "@faridalms/database/stores/files";
import { plainContent } from "@faridalms/domain/content-conversion";
import {
  readReplyAddress,
  REPLY_MARKER,
} from "@faridalms/domain/email-replies";
import { describe, expect, test } from "bun:test";

import type { InboundMail } from "../src/messages/inbound";
import type { Inbox, ReceivedEmail } from "../src/notifications/resend-inbox";

import { claimConversations } from "../src/messages/conversations";
import { INBOUND_PATH, MAIL_PER_HOUR } from "../src/messages/inbound";
import { deliverTenant } from "../src/notifications/deliver";
import { signWebhook } from "../src/notifications/resend-inbox";
import {
  client,
  handlerWith,
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  workerModules,
} from "./harness";

const officer = () => sessionFor("northwind", login("staff"));
const principal = () => sessionFor("northwind", login("principal"));
const teacher = () => sessionFor("northwind", login("teacher"));
const parent = () =>
  sessionFor("northwind", login("student").replace("student", "parent"));

const DOMAIN = "reply.example.com";
const SECRET = `whsec_${Buffer.from("a-test-signing-secret-of-32-bytes").toString("base64")}`;

/** Received mail as Resend's API would return it, kept in memory. */
class TestInbox implements Inbox {
  readonly emails = new Map<string, ReceivedEmail>();
  readonly bytes = new Map<string, Uint8Array>();

  email(id: string) {
    return Promise.resolve(this.emails.get(id) ?? null);
  }

  attachment(emailId: string, attachmentId: string, maxBytes: number) {
    const found = this.bytes.get(`${emailId}/${attachmentId}`) ?? null;
    return Promise.resolve(
      found && found.byteLength <= maxBytes ? found : null,
    );
  }
}

const inbox = new TestInbox();
const inbound: InboundMail = {
  domain: DOMAIN,
  webhookSecret: SECRET,
  inbox,
  senderDomain: "mail.example.com",
};
const app = () => handlerWith({ inbound });

const tenantId = () => seeded().tenants[0]?.tenantId ?? "";

/** Sends what is due, with replies coming back to the test's receiving domain. */
function deliver() {
  const { cell, mail, cellSecret, files } = seeded();
  return deliverTenant(
    cell,
    {
      email: mail,
      sms: null,
      conversations: { replyDomain: DOMAIN, cellSecret, files },
    },
    tenantId(),
    workerModules(),
  );
}

/** Resend telling the API an email arrived, signed or not. */
async function webhook(
  email: Partial<ReceivedEmail> & { to: string[] },
  options: { signed?: boolean } = {},
) {
  const id = email.id ?? crypto.randomUUID();
  const received: ReceivedEmail = {
    from: "salama.family@example.com",
    cc: [],
    subject: "Re: your enquiry",
    text: "Thank you.",
    html: null,
    headers: {},
    messageId: `<${id}@mail.example.org>`,
    authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    attachments: [],
    ...email,
    id,
  };
  inbox.emails.set(id, received);
  return signedEvent(
    {
      type: "email.received",
      created_at: new Date().toISOString(),
      data: { email_id: id, to: received.to, cc: [], from: received.from },
    },
    options,
  );
}

/** A webhook Resend signed, or one that only claims to be, to the handler given. */
async function signedEvent(
  event: object,
  options: { signed?: boolean; handler?: ReturnType<typeof app> } = {},
) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const svixId = `msg_${crypto.randomUUID()}`;
  const response = await (options.handler ?? app())(
    new Request(`http://api.test${INBOUND_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(timestamp),
        "svix-signature":
          options.signed === false
            ? "v1,bm90IGEgc2lnbmF0dXJl"
            : signWebhook({ secret: SECRET, id: svixId, timestamp, body }),
      },
      body,
    }),
  );
  return {
    status: response.status,
    outcome: ((await response.json()) as { outcome?: string }).outcome,
  };
}

/** A family's enquiry taken at the desk, with its conversation and the family's address. */
async function enquiryFrom(email: string) {
  const { api } = await officer();
  const logged = await api.admissions.logEnquiry({
    source: "walk_in",
    purpose: "enquiry",
    locale: "en",
    name: "Salama Ashoush",
    email,
    phone: "010 0555 0123",
    childName: "Yusuf",
    childYear: "Grade 2",
    message: "",
    assigneeId: "",
  });
  if (!logged.threadId) throw new Error("no conversation");
  return { api, enquiryId: logged.id, threadId: logged.threadId };
}

/** Writes to the family and returns the reply address their email carried. */
async function replyAddressOf(
  api: Awaited<ReturnType<typeof officer>>["api"],
  threadId: string,
  to: string,
  words: string,
) {
  await api.messages.send({
    threadId,
    content: plainContent(words),
    force: true,
  });
  await deliver();
  const email = seeded().mail.sent.findLast((item) => item.to === to);
  if (!email?.replyTo) throw new Error("no reply address");
  return { email, replyTo: email.replyTo };
}

describe("a team's mailbox", () => {
  test("every holder of its capability reads its conversations; others do not", async () => {
    const { threadId } = await enquiryFrom("salama.mailbox@example.com");
    const office = await officer();
    const listed = await office.api.messages.inbox({ box: "admissions" });
    expect(listed.mailboxes).toContain("admissions");
    expect(listed.rows.map((row) => row.id)).toContain(threadId);
    expect(listed.rows.find((row) => row.id === threadId)?.mailbox).toBe(
      "admissions",
    );
    const head = await principal();
    expect((await head.api.messages.thread({ id: threadId })).team).toBeTrue();
    const other = await teacher();
    expect(
      await rejection(other.api.messages.thread({ id: threadId })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await other.api.messages.inbox({})).rows.some(
        (row) => row.id === threadId,
      ),
    ).toBeFalse();
  });

  test("a reply someone overtook is refused until it is read, unless sent anyway", async () => {
    const { threadId } = await enquiryFrom("salama.collide@example.com");
    const office = await officer();
    const head = await principal();
    const seen = await office.api.messages.thread({ id: threadId });
    await head.api.messages.send({
      threadId,
      content: plainContent("I have answered them."),
      after: seen.latestId ?? "",
    });
    expect(
      await rejection(
        office.api.messages.send({
          threadId,
          content: plainContent("Thank you for visiting."),
          after: seen.latestId ?? "",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "messages.newer" });
    const sent = await office.api.messages.send({
      threadId,
      content: plainContent("Thank you for visiting."),
      after: seen.latestId ?? "",
      force: true,
    });
    expect(sent.id).toBeString();
  });
});

describe("email to and from an outside contact", () => {
  test("a message leaves as email in the school's name, with a reply address naming no record", async () => {
    const address = "salama.out@example.com";
    const { api, threadId, enquiryId } = await enquiryFrom(address);
    const { email, replyTo } = await replyAddressOf(
      api,
      threadId,
      address,
      "We would be glad to show you round.",
    );
    const routed = readReplyAddress(replyTo, DOMAIN);
    expect(routed?.tenantId).toBe(tenantId());
    expect(replyTo).not.toContain(threadId.replaceAll("-", ""));
    expect(replyTo).not.toContain(enquiryId.replaceAll("-", ""));
    expect(email).toMatchObject({
      fromName: "Northwind International College",
      subject: "Your enquiry to Northwind International College",
    });
    expect(email.text).toStartWith(REPLY_MARKER.en);
    expect(email.text).toContain("We would be glad to show you round.");
    const note = await api.messages.send({
      threadId,
      kind: "note",
      content: plainContent("Not for the family."),
    });
    expect(note.id).toBeString();
    const before = seeded().mail.sent.length;
    await deliver();
    expect(
      seeded()
        .mail.sent.slice(before)
        .some((item) => item.to === address),
    ).toBeFalse();
  });

  test("the family's reply, from their own address, lands in the conversation without the quote", async () => {
    const address = "salama.in@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { replyTo } = await replyAddressOf(
      api,
      threadId,
      address,
      "When can you visit?",
    );
    inbox.bytes.set("email-in-1/att-1", new TextEncoder().encode("Tue, Thu."));
    const answered = await webhook({
      from: `Salama Ashoush <${address}>`,
      to: [replyTo],
      text: `Tuesday at ten suits us.\n\nOn Mon, 2 Nov 2026, Northwind wrote:\n> ${REPLY_MARKER.en}\n> When can you visit?`,
      attachments: [
        {
          id: "att-1",
          filename: "dates.txt",
          contentType: "text/plain",
          size: 9,
        },
        {
          id: "att-2",
          filename: "huge.txt",
          contentType: "text/plain",
          size: 5 * 1024 * 1024,
        },
      ],
      id: "email-in-1",
    });
    expect(answered).toEqual({ status: 200, outcome: "posted" });
    const opened = await api.messages.thread({ id: threadId });
    const last = opened.messages.at(-1);
    expect(last?.kind).toBe("message");
    expect(last?.authorNameEn).toBe("Salama Ashoush");
    expect(last?.body).toBe("Tuesday at ten suits us.\ndates.txt");
    expect(last?.authorContactId).toBeString();
    expect(last?.details).toMatchObject({
      emailId: "email-in-1",
      skipped: [{ name: "huge.txt", reason: "too_large" }],
    });
    const again = await webhook({
      from: address,
      to: [replyTo],
      id: "email-in-1",
    });
    expect(again.outcome).toBe("duplicate");
  });

  test("an attachment the family sends is checked, kept and opened by the team", async () => {
    const address = "salama.files@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { replyTo } = await replyAddressOf(
      api,
      threadId,
      address,
      "Please send the form.",
    );
    inbox.bytes.set(
      "email-files/form",
      new TextEncoder().encode("Signed form."),
    );
    const result = await webhook({
      id: "email-files",
      from: address,
      to: [replyTo],
      text: "Here it is.",
      attachments: [
        {
          id: "form",
          filename: "form.txt",
          contentType: "text/plain",
          size: 12,
        },
      ],
    });
    expect(result.outcome).toBe("posted");
    const last = (await api.messages.thread({ id: threadId })).messages.at(-1);
    const block = last?.content?.root.children?.find(
      (node) => node.type === "file",
    );
    expect(block?.name).toBe("form.txt");
    const office = await officer();
    const read = await raw(
      "northwind",
      office.token,
      `/v1/files/${block?.fileId}/content`,
    );
    expect(read.status).toBe(200);
    expect(await read.text()).toBe("Signed form.");
    const { cell, tenants } = seeded();
    const tenant = tenants[0]?.tenantId ?? "";
    const kept = await cell.withWorker(
      {
        tenantId: tenant,
        requestId: crypto.randomUUID(),
        actor: { kind: "system" },
      },
      "read",
      (tx) => fileById(tx, tenant, block?.fileId ?? ""),
    );
    expect(kept?.purpose).toBe("message_attachment");
    const outsider = await teacher();
    expect(
      (
        await raw(
          "northwind",
          outsider.token,
          `/v1/files/${block?.fileId}/content`,
        )
      ).status,
    ).toBe(404);
  });

  test("mail from another address, or one that fails its checks, is held for the team, never posted", async () => {
    const address = "salama.held@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { replyTo } = await replyAddressOf(api, threadId, address, "Hello.");
    const stranger = await webhook({
      from: "someone.else@example.org",
      to: [replyTo],
      text: "I am the family, honestly.",
    });
    expect(stranger.outcome).toBe("held");
    const spoofed = await webhook({
      from: address,
      to: [replyTo],
      text: "Spoofed.",
      authentication: { spf: "fail", dkim: "fail", dmarc: "fail" },
    });
    expect(spoofed.outcome).toBe("held");
    const entries = (await api.messages.thread({ id: threadId })).messages;
    expect(
      entries.slice(-2).map((entry) => [entry.kind, entry.details.reason]),
    ).toEqual([
      ["held", "sender"],
      ["held", "unauthenticated"],
    ]);
    expect(
      entries.slice(-2).every((entry) => entry.authorContactId === null),
    ).toBeTrue();
  });

  test("the team lets held mail in as the family's message, once", async () => {
    const address = "salama.accepted@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { replyTo } = await replyAddressOf(api, threadId, address, "Hello.");
    await webhook({
      from: "salama.work@example.org",
      to: [replyTo],
      text: "Writing from my work address: Thursday suits us.",
    });
    const held = (await api.messages.thread({ id: threadId })).messages.at(-1);
    if (held?.kind !== "held") throw new Error("the mail was not held");
    expect(
      await rejection(
        (await teacher()).api.messages.acceptHeld({
          threadId,
          entryId: held.id,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const before = seeded().mail.sent.length;
    const accepted = await api.messages.acceptHeld({
      threadId,
      entryId: held.id,
    });
    const entries = (await api.messages.thread({ id: threadId })).messages;
    const posted = entries.find((entry) => entry.id === accepted.id);
    expect(posted).toMatchObject({
      kind: "message",
      authorNameEn: "Salama Ashoush",
      body: "Writing from my work address: Thursday suits us.",
      details: { acceptedFrom: held.id },
    });
    expect(posted?.authorContactId).toBeString();
    expect(
      entries.find((entry) => entry.id === held.id)?.details,
    ).toMatchObject({ acceptedAs: accepted.id });
    expect(
      await rejection(api.messages.acceptHeld({ threadId, entryId: held.id })),
    ).toMatchObject({ code: "CONFLICT", message: "messages.not_held" });
    await deliver();
    expect(
      seeded()
        .mail.sent.slice(before)
        .some((item) => item.to === address),
    ).toBeFalse();
  });

  test("machines, unknown addresses, floods and unsigned calls never reach a conversation", async () => {
    const address = "salama.machines@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { replyTo } = await replyAddressOf(api, threadId, address, "Hello.");
    expect(
      (
        await webhook({
          from: address,
          to: [replyTo],
          headers: { "auto-submitted": "auto-replied" },
          text: "I am out of the office.",
        })
      ).outcome,
    ).toBe("automated");
    expect(
      (await webhook({ from: "mailer-daemon@example.org", to: [replyTo] }))
        .outcome,
    ).toBe("automated");
    expect(
      (await webhook({ from: "no-reply@mail.example.com", to: [replyTo] }))
        .outcome,
    ).toBe("automated");
    const routed = readReplyAddress(replyTo, DOMAIN);
    expect(
      (
        await webhook({
          from: address,
          to: [
            `r+${routed?.tenantId.replaceAll("-", "")}.${"a".repeat(26)}@${DOMAIN}`,
          ],
        })
      ).outcome,
    ).toBe("unknown_token");
    expect(
      (await webhook({ from: address, to: ["office@example.com"] })).outcome,
    ).toBe("unknown_address");
    expect(
      (await webhook({ from: address, to: [replyTo] }, { signed: false }))
        .status,
    ).toBe(401);
    const before = (await api.messages.thread({ id: threadId })).messages
      .length;
    for (let sent = 0; sent < MAIL_PER_HOUR; sent += 1)
      await webhook({ from: address, to: [replyTo], text: `Number ${sent}` });
    expect(
      (await webhook({ from: address, to: [replyTo], text: "One too many" }))
        .outcome,
    ).toBe("flood");
    const after = (await api.messages.thread({ id: threadId })).messages;
    expect(after.length).toBe(before + MAIL_PER_HOUR);
  });
});

/** Resend reporting what became of mail the platform sent for a tenant. */
const report = (
  type: "email.bounced" | "email.complained",
  to: string,
  options: {
    tenant?: string;
    bounce?: string;
    handler?: ReturnType<typeof app>;
  } = {},
) =>
  signedEvent(
    {
      type,
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        from: "Northwind <no-reply@mail.example.com>",
        to: [to],
        subject: "Your enquiry",
        tags: { tenant: options.tenant ?? tenantId() },
        ...(type === "email.bounced"
          ? {
              bounce: {
                type: options.bounce ?? "Permanent",
                subType: "General",
              },
            }
          : {}),
      },
    },
    { handler: options.handler },
  );

describe("mail that cannot reach a contact", () => {
  test("each email names its tenant, so its bounce reaches only that tenant", async () => {
    const address = "salama.tagged@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { email } = await replyAddressOf(api, threadId, address, "Hello.");
    expect(email.tags).toEqual({ tenant: tenantId() });
    const elsewhere = await report("email.bounced", address, {
      tenant: crypto.randomUUID(),
    });
    expect(elsewhere.outcome).toBe("unknown_tenant");
    const passing = await report("email.bounced", address, {
      bounce: "Transient",
    });
    expect(passing.outcome).toBe("transient");
    const opened = await api.messages.thread({ id: threadId });
    expect(
      opened.members.find((member) => member.outside)?.unreachable,
    ).toBeNull();
  });

  test("a permanent bounce stops email to the contact and tells the team why", async () => {
    const address = "salama.bounced@example.com";
    const { api, threadId } = await enquiryFrom(address);
    await replyAddressOf(api, threadId, address, "Hello.");
    expect(
      (await report("email.bounced", address, { handler: handlerWith({}) }))
        .status,
    ).toBe(404);
    const marked = await report("email.bounced", address.toUpperCase(), {
      handler: handlerWith({ mailEvents: { webhookSecret: SECRET } }),
    });
    expect(marked).toEqual({ status: 200, outcome: "unreachable" });
    const opened = await api.messages.thread({ id: threadId });
    expect(opened.members.find((member) => member.outside)?.unreachable).toBe(
      "bounced",
    );
    const before = seeded().mail.sent.length;
    await api.messages.send({
      threadId,
      content: plainContent("Are you still there?"),
      force: true,
    });
    await deliver();
    expect(
      seeded()
        .mail.sent.slice(before)
        .some((item) => item.to === address),
    ).toBeFalse();
  });

  test("a complaint outlasts the family writing again; a bounce does not", async () => {
    const address = "salama.complains@example.com";
    const { api, threadId } = await enquiryFrom(address);
    const { replyTo } = await replyAddressOf(api, threadId, address, "Hello.");
    await report("email.bounced", address);
    expect(
      (await webhook({ from: address, to: [replyTo], text: "We are here." }))
        .outcome,
    ).toBe("posted");
    const member = async () =>
      (await api.messages.thread({ id: threadId })).members.find(
        (row) => row.outside,
      )?.unreachable;
    expect(await member()).toBeNull();
    expect((await report("email.complained", address)).outcome).toBe(
      "unreachable",
    );
    await webhook({ from: address, to: [replyTo], text: "Still here." });
    expect(await member()).toBe("complained");
    expect(
      (await report("email.complained", address, { tenant: "not-a-tenant" }))
        .outcome,
    ).toBe("unknown_tenant");
  });
});

describe("a family writing from two addresses", () => {
  test("is merged into one contact, keeping both conversations and every entry", async () => {
    const home = "salama.merge.home@example.com";
    const work = "salama.merge.work@example.org";
    const first = await enquiryFrom(home);
    const second = await enquiryFrom(work);
    const { api } = first;
    const fromWork = await replyAddressOf(api, second.threadId, work, "Hi.");
    const outsideOf = async (threadId: string) =>
      (await api.messages.thread({ id: threadId })).members.find(
        (member) => member.outside,
      );
    const kept = await outsideOf(first.threadId);
    const other = await outsideOf(second.threadId);
    if (!kept?.contactId || !other?.contactId)
      throw new Error("no outside contacts");
    expect(
      await webhook({ from: work, to: [fromWork.replyTo], text: "From work." }),
    ).toMatchObject({ outcome: "posted" });

    const found = await api.messages.contacts({ q: "salama.merge" });
    expect(found.rows.map((row) => row.id).toSorted()).toEqual(
      [kept.contactId, other.contactId].toSorted(),
    );
    expect(
      await rejection(
        (await teacher()).api.messages.mergeContacts({
          intoId: kept.contactId,
          fromId: other.contactId,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const entriesBefore = (await api.messages.thread({ id: second.threadId }))
      .messages.length;
    const merged = await api.messages.mergeContacts({
      intoId: kept.contactId,
      fromId: other.contactId,
    });
    expect(merged).toEqual({ conversations: 1, entries: 1 });

    const after = await api.messages.thread({ id: second.threadId });
    expect(after.messages.length).toBe(entriesBefore);
    const moved = after.members.find((member) => member.outside);
    expect(moved).toMatchObject({
      contactId: kept.contactId,
      email: home,
      aliases: [work],
    });
    expect(
      after.messages
        .filter((entry) => entry.authorContactId !== null)
        .every((entry) => entry.authorContactId === kept.contactId),
    ).toBeTrue();
    expect(
      (await api.messages.contacts({ q: work })).rows.map((row) => row.id),
    ).toEqual([kept.contactId]);

    expect(
      await webhook({
        from: work,
        to: [fromWork.replyTo],
        text: "Still from work.",
      }),
    ).toMatchObject({ outcome: "posted" });
    const fromHome = await replyAddressOf(api, first.threadId, home, "Hello.");
    expect(
      await webhook({
        from: work,
        to: [fromHome.replyTo],
        text: "Answering the other one from work.",
      }),
    ).toMatchObject({ outcome: "posted" });

    const third = await enquiryFrom(work);
    expect(await outsideOf(third.threadId)).toMatchObject({
      contactId: kept.contactId,
    });
    expect(
      await rejection(
        api.messages.mergeContacts({
          intoId: kept.contactId,
          fromId: other.contactId,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("an outside contact who becomes a family with an account", () => {
  test("takes over the same conversations in their portal, without the team's internal entries", async () => {
    const address = "salama.link@example.com";
    const { api, threadId } = await enquiryFrom(address);
    await api.messages.send({
      threadId,
      content: plainContent("Welcome to the school."),
      force: true,
    });
    await api.messages.send({
      threadId,
      kind: "note",
      content: plainContent("Seems keen."),
    });
    await deliver();
    const family = await parent();
    const me = await family.api.identity.currentUser();
    const { cell } = seeded();
    const school = seeded().tenants[0]?.schools[0]?.id ?? "";
    const linked = await cell.withTenant(
      {
        tenantId: tenantId(),
        requestId: crypto.randomUUID(),
        actor: { kind: "system" },
      },
      "write",
      (tx) =>
        claimConversations(tx, {
          tenantId: tenantId(),
          schoolId: school,
          userId: me.id,
          verifiedEmail: address.toUpperCase(),
        }),
    );
    expect(linked.conversations).toBe(1);
    const theirs = await family.api.messages.inbox({});
    expect(theirs.rows.map((row) => row.id)).toContain(threadId);
    const opened = await family.api.messages.thread({ id: threadId });
    expect(opened.team).toBeFalse();
    expect(
      opened.messages.every((entry) => entry.kind === "message"),
    ).toBeTrue();
    expect(opened.messages.map((entry) => entry.body)).toContain(
      "Welcome to the school.",
    );
    expect(
      await rejection(
        family.api.messages.send({
          threadId,
          kind: "note",
          content: plainContent("Trying a note."),
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    await family.api.messages.send({
      threadId,
      content: plainContent("Thank you, see you Tuesday."),
    });
    const office = await officer();
    const told = (
      await office.api.notifications.list({ tab: "all" })
    ).rows.find((row) => row.subjectId === threadId);
    expect(told?.kind).toBe("message");
    const before = seeded().mail.sent.length;
    await office.api.messages.send({
      threadId,
      content: plainContent("See you then."),
      force: true,
    });
    await deliver();
    expect(
      seeded()
        .mail.sent.slice(before)
        .some((item) => item.to === address),
    ).toBeFalse();
  });
});

describe("the attendance office's calls", () => {
  test("are logged contacts in its conversation with the family", async () => {
    const office = await principal();
    const child = await (
      await sessionFor("northwind", login("student"))
    ).api.identity.currentUser();
    const day = new Date().toISOString().slice(0, 10);
    const { id } = await office.api.followUp.logContact({
      studentId: child.id,
      date: day,
      outcome: "left_message",
      note: "Left a voicemail with the mother.",
    });
    const listed = await office.api.messages.inbox({ box: "attendance" });
    const thread = listed.rows.find((row) => row.studentId === child.id);
    if (!thread) throw new Error("no attendance conversation");
    const opened = await office.api.messages.thread({ id: thread.id });
    expect(opened.messages.find((entry) => entry.id === id)).toMatchObject({
      kind: "call",
      body: "Left a voicemail with the mother.",
      details: { outcome: "left_message", studentId: child.id, on: day },
    });
    const family = await parent();
    expect(
      (await family.api.messages.thread({ id: thread.id })).messages,
    ).toEqual([]);
  });

  test("take in a guardian linked after the conversation began", async () => {
    const office = await principal();
    const child = await (
      await sessionFor("northwind", login("student"))
    ).api.identity.currentUser();
    const day = new Date().toISOString().slice(0, 10);
    await office.api.followUp.logContact({
      studentId: child.id,
      date: day,
      outcome: "no_answer",
      note: "",
    });
    const relations = await office.api.guardians.relations();
    const uncle = relations.find((row) => row.code === "uncle") ?? relations[0];
    if (!uncle) throw new Error("no relation");
    await office.api.guardians.saveLink({
      studentId: child.id,
      person: {
        names: {
          en: { given: "Tarek", family: "Ashoush" },
          ar: { given: "طارق", family: "عشوش" },
        },
        phone: "",
      },
      flags: {
        relationId: uncle.id,
        legalGuardian: true,
        portalAccess: true,
        receivesNotifications: true,
        primaryContact: false,
        emergencyContact: false,
        residence: "none",
        pickup: "allowed",
      },
    });
    const link = (
      await office.api.guardians.ofStudent({ studentId: child.id })
    ).guardians.find((row) => row.fullNameEn === "Tarek Ashoush");
    if (!link) throw new Error("link missing");
    await office.api.people.saveSignIn({
      userId: link.userId,
      loginName: "tarek.ashoush@example.com",
      password: "a long guardian password",
    });
    const session = await client("northwind").identity.signIn({
      loginName: "tarek.ashoush@example.com",
      password: "a long guardian password",
    });
    const joined = client("northwind", session.token);
    const listed = await office.api.messages.inbox({ box: "attendance" });
    const thread = listed.rows.find((row) => row.studentId === child.id);
    if (!thread) throw new Error("no attendance conversation");
    expect(
      await rejection(joined.messages.thread({ id: thread.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    await office.api.followUp.logContact({
      studentId: child.id,
      date: day,
      outcome: "left_message",
      note: "",
    });
    // In it now, the guardian reads what the office writes to the family.
    expect((await joined.messages.thread({ id: thread.id })).messages).toEqual(
      [],
    );
  });
});
