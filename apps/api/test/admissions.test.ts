import type { SectionOf } from "@faridalms/domain/website";
import type { RouterClient } from "@orpc/server";

import { fillFields, plainContent } from "@faridalms/domain/content-conversion";
import { formDocument } from "@faridalms/domain/questions";
import { newSection } from "@faridalms/domain/website";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, test } from "bun:test";

import type { AppRouter } from "../src/router";

import { createTurnstile } from "../src/core/turnstile";
import { deliverTenant } from "../src/notifications/deliver";
import { handlerWith, login, rejection, seeded, sessionFor } from "./harness";

const principal = () => sessionFor("northwind", login("principal"));
const officer = () => sessionFor("northwind", login("staff"));
const teacher = () => sessionFor("northwind", login("teacher"));

/** A visitor whose requests arrive from one address, through the app given. */
function visitorFrom(
  address: string,
  handler: (request: Request) => Promise<Response> = seeded().handler,
) {
  const api: RouterClient<AppRouter> = createORPCClient(
    new RPCLink({
      url: "http://api.test/rpc",
      headers: () => ({ "x-forwarded-for": address }),
      fetch: (request, init) => handler(new Request(request, init)),
    }),
  );
  return api.site;
}

const QUESTIONS = {
  heard: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d01",
  start: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d02",
  siblings: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d03",
};
const OPTIONS = {
  friend: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d11",
  social: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d12",
};
const FORM_ID = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d00";
const ASKED = { points: 0, hints: [], explanation: "", tries: null };
const chose = (optionId: string) => ({
  type: "choice" as const,
  optionIds: [optionId],
});

/** A form that asks for a phone, not an email, and three questions of the school's own. */
function form(locale: "en" | "ar"): SectionOf<"form"> {
  const blank = newSection("form");
  const ar = locale === "ar";
  return {
    ...blank,
    id: FORM_ID,
    data: {
      ...blank.data,
      heading: ar ? "استفسر" : "Enquire",
      email: "hide",
      phone: "require",
      child: "ask",
      questions: formDocument([
        {
          ...ASKED,
          id: QUESTIONS.heard,
          type: "choice",
          prompt: ar ? "كيف عرفت عنا؟" : "How did you hear about us?",
          required: true,
          options: [
            {
              id: OPTIONS.friend,
              text: ar ? "صديق" : "A friend",
              feedback: "",
            },
            {
              id: OPTIONS.social,
              text: ar ? "وسائل التواصل" : "Social media",
              feedback: "",
            },
          ],
          correctOptionIds: [],
          multiple: false,
          shuffle: false,
        },
        {
          ...ASKED,
          id: QUESTIONS.start,
          type: "text",
          prompt: ar ? "تاريخ البدء" : "Hoped-for start",
          date: true,
          answers: [],
          caseSensitive: false,
          closeEnough: false,
          tehMarbuta: true,
        },
        {
          ...ASKED,
          id: QUESTIONS.siblings,
          type: "number",
          prompt: ar ? "عدد الإخوة" : "Brothers and sisters",
          mode: "exact",
          value: 0,
          tolerance: 0,
          percent: false,
          min: 0,
          max: 0,
        },
      ]),
    },
  };
}

let published: Promise<void> | null = null;
/** Publishes a page holding the form, once for the file. */
function publishForm() {
  published ??= (async () => {
    const { api } = await principal();
    const saved = await api.site.savePage({
      id: "",
      expectedVersion: 0,
      parentId: "",
      slug: "enquire-here",
      titleEn: "Enquire here",
      titleAr: "استفسر هنا",
      inMenu: false,
      content: { sections: [form("en")], description: "", reviewed: [] },
      translation: { sections: [form("ar")], description: "", reviewed: [] },
    });
    await api.site.publishPage({
      id: saved.id,
      expectedVersion: saved.version,
    });
  })();
  return published;
}

const sent = (name: string, more: Record<string, unknown> = {}) => ({
  school: "northwind",
  locale: "en" as const,
  page: "enquire-here",
  sectionId: FORM_ID,
  name,
  phone: "+20 100 555 0199",
  childName: "Yusuf",
  answers: { [QUESTIONS.heard]: chose(OPTIONS.friend) },
  elapsed: 9000,
  ...more,
});

async function findEnquiry(name: string) {
  const { api } = await officer();
  const list = await api.admissions.enquiries({ state: "all", q: name });
  const row = list.rows.find((item) => item.name === name);
  if (!row) throw new Error(`no enquiry from ${name}`);
  return row;
}

describe("the website's form", () => {
  test("asks what the school chose and keeps each answer in the words the family saw", async () => {
    await publishForm();
    const site = visitorFrom("192.0.2.10");
    expect(
      await rejection(site.submitEnquiry(sent("No phone", { phone: "" }))),
    ).toMatchObject({ message: "validation.required" });
    expect(
      await rejection(site.submitEnquiry(sent("No answer", { answers: {} }))),
    ).toMatchObject({
      message: "validation.required",
      data: { questionId: QUESTIONS.heard },
    });
    expect(
      await rejection(
        site.submitEnquiry(
          sent("Not an option", {
            answers: {
              [QUESTIONS.heard]: chose("0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d19"),
            },
          }),
        ),
      ),
    ).toMatchObject({ message: "validation.invalid" });
    expect(
      await rejection(
        site.submitEnquiry(
          sent("Not a day", {
            answers: {
              [QUESTIONS.heard]: chose(OPTIONS.friend),
              [QUESTIONS.start]: { type: "text", text: "2027-02-30" },
            },
          }),
        ),
      ),
    ).toMatchObject({ message: "validation.invalid" });

    expect(
      await site.submitEnquiry(
        sent("Salama Ashoush (form)", {
          email: "hidden@example.com",
          answers: {
            [QUESTIONS.heard]: chose(OPTIONS.social),
            [QUESTIONS.start]: { type: "text", text: "2027-01-10" },
            [QUESTIONS.siblings]: { type: "number", text: "٢" },
            "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3dff": {
              type: "text",
              text: "not asked",
            },
          },
        }),
      ),
    ).toEqual({ received: true });
    await visitorFrom("192.0.2.11").submitEnquiry(
      sent("سلامة عشوش (نموذج)", {
        locale: "ar",
        answers: { [QUESTIONS.heard]: chose(OPTIONS.friend) },
      }),
    );

    const { api } = await officer();
    const english = await api.admissions.enquiry({
      id: (await findEnquiry("Salama Ashoush (form)")).id,
    });
    expect(english).toMatchObject({
      source: "website",
      state: "open",
      email: "",
      phone: "+20 100 555 0199",
      childName: "Yusuf",
      pageTitleEn: "Enquire here",
      pageTitleAr: "استفسر هنا",
    });
    expect(english.answers).toEqual([
      {
        id: QUESTIONS.heard,
        prompt: "How did you hear about us?",
        kind: "choice",
        response: chose(OPTIONS.social),
        text: "Social media",
      },
      {
        id: QUESTIONS.start,
        prompt: "Hoped-for start",
        kind: "text",
        response: { type: "text", text: "2027-01-10" },
        text: "2027-01-10",
        date: true,
      },
      {
        id: QUESTIONS.siblings,
        prompt: "Brothers and sisters",
        kind: "number",
        response: { type: "number", text: "٢" },
        text: "٢",
      },
    ]);
    const arabic = await api.admissions.enquiry({
      id: (await findEnquiry("سلامة عشوش (نموذج)")).id,
    });
    expect(arabic.locale).toBe("ar");
    expect(arabic.answers).toEqual([
      {
        id: QUESTIONS.heard,
        prompt: "كيف عرفت عنا؟",
        kind: "choice",
        response: chose(OPTIONS.friend),
        text: "صديق",
      },
    ]);
  });

  test("tells the people who work enquiries that one arrived, and nobody else", async () => {
    await publishForm();
    const name = `Salama Ashoush ${crypto.randomUUID().slice(0, 4)}`;
    await visitorFrom("192.0.2.12").submitEnquiry(sent(name));
    const row = await findEnquiry(name);
    const told = async (session: Awaited<ReturnType<typeof officer>>) =>
      (await session.api.notifications.list({ tab: "all" })).rows.find(
        (notice) => notice.kind === "enquiry" && notice.subjectId === row.id,
      );
    expect(await told(await officer())).toMatchObject({
      params: { title: name, purpose: "enquiry" },
    });
    expect(await told(await principal())).toBeDefined();
    expect(await told(await teacher())).toBeUndefined();
  });

  test("with Turnstile set up, takes only a token Cloudflare vouches for", async () => {
    await publishForm();
    const asked: Record<string, unknown>[] = [];
    const answers = new Map<string, Record<string, unknown>>([
      [
        "good",
        { success: true, action: "enquiry", hostname: "northwind.example.net" },
      ],
      [
        "elsewhere",
        { success: true, action: "enquiry", hostname: "evil.example.org" },
      ],
      [
        "other-form",
        { success: true, action: "signup", hostname: "northwind.example.net" },
      ],
      ["spent", { success: false, "error-codes": ["timeout-or-duplicate"] }],
    ]);
    const turnstile = createTurnstile({
      siteKey: "site-key",
      secretKey: "secret-key",
      retryDelaysMs: [],
      fetch: (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as Record<string, unknown>;
        asked.push(body);
        return Response.json(
          answers.get(String(body.response)) ?? { success: false },
        );
      }) as typeof fetch,
    });
    const handler = handlerWith({ turnstile });
    const site = visitorFrom("198.18.0.60", handler);
    const shell = await site.publicSite({ school: "northwind" });
    expect(shell.turnstileKey).toBe("site-key");
    for (const token of ["", "elsewhere", "other-form", "spent"])
      expect(
        await rejection(
          site.submitEnquiry(sent(`Robot ${token}`, { turnstile: token })),
        ),
      ).toMatchObject({ message: "site.challenge" });
    expect(
      await site.submitEnquiry(
        sent("Salama Ashoush (checked)", { turnstile: "good" }),
      ),
    ).toEqual({ received: true });
    expect(asked.at(-1)).toMatchObject({
      secret: "secret-key",
      response: "good",
      remoteip: "198.18.0.60",
    });
    expect(typeof asked.at(-1)?.idempotency_key).toBe("string");
    await findEnquiry("Salama Ashoush (checked)");
  });
});

describe("the enquiry inbox", () => {
  test("is for those who work admissions; teachers see none of it", async () => {
    const { api } = await teacher();
    expect(await rejection(api.admissions.enquiries({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("an enquiry is assigned, contacted, answered by email, closed with a reason and reopened", async () => {
    await publishForm();
    const name = `Salama Ashoush ${crypto.randomUUID().slice(0, 4)}`;
    await visitorFrom("192.0.2.13").submitEnquiry(
      sent(name, { email: "", phone: "+20 100 555 0177" }),
    );
    const { api } = await officer();
    const listed = await findEnquiry(name);
    expect(listed).toMatchObject({ state: "open", assignee: null });
    const open = await api.admissions.enquiries({ state: "open" });
    expect(open.rows.map((row) => row.id)).toContain(listed.id);
    expect(open.counts.open).toBeGreaterThan(0);

    const page = await api.admissions.enquiry({ id: listed.id });
    expect(page.moves).toEqual(["in_progress", "converted", "closed"]);
    const me = await api.identity.currentUser();
    expect(page.staff.map((row) => row.id)).toContain(me.id);

    const assigned = await api.admissions.assignEnquiry({
      id: listed.id,
      expectedVersion: page.version,
      assigneeId: me.id,
    });
    expect((await findEnquiry(name)).assignee?.id).toBe(me.id);
    expect(
      (
        await api.admissions.enquiries({
          assignee: "me",
          state: "all",
          q: name,
        })
      ).rows,
    ).toHaveLength(1);
    expect(
      await rejection(
        api.admissions.assignEnquiry({
          id: listed.id,
          expectedVersion: page.version,
          assigneeId: "",
        }),
      ),
    ).toMatchObject({ message: "conflict.version" });

    // The enquiry's conversation is the one timeline: the family's words,
    // then each change, note and call, written through Messages.
    const threadId = page.threadId;
    if (!threadId) throw new Error("the enquiry has no conversation");
    await api.messages.send({
      threadId,
      kind: "note",
      content: plainContent("Prefers a call after four."),
    });
    let now = await api.admissions.enquiry({ id: listed.id });
    expect(now.state).toBe("open");
    expect(now.firstRespondedAt).toBeNull();

    await api.messages.send({
      threadId,
      kind: "call",
      content: plainContent("Called; a tour on Tuesday suits them."),
    });
    now = await api.admissions.enquiry({ id: listed.id });
    expect(now.state).toBe("in_progress");
    expect(now.firstRespondedAt).not.toBeNull();
    const timeline = await api.messages.thread({ id: threadId });
    expect(timeline.messages.map((entry) => entry.kind)).toEqual([
      "message",
      "event",
      "note",
      "call",
      "event",
    ]);
    expect(timeline.messages[0]?.authorContactId).not.toBeNull();
    expect(timeline.messages.at(-1)?.details).toMatchObject({
      event: "state",
      from: "open",
      to: "in_progress",
      automatic: true,
    });
    expect(timeline).toMatchObject({
      mailbox: "admissions",
      team: true,
      canNote: true,
      emailsOutside: false,
      owner: { userId: me.id },
    });
    expect(now.version).toBeGreaterThan(assigned.version);

    expect(
      await rejection(
        api.admissions.moveEnquiry({
          id: listed.id,
          expectedVersion: now.version,
          state: "open",
        }),
      ),
    ).toMatchObject({ message: "enquiry.state" });
    expect(
      await rejection(
        api.admissions.moveEnquiry({
          id: listed.id,
          expectedVersion: now.version,
          state: "closed",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const closed = await api.admissions.moveEnquiry({
      id: listed.id,
      expectedVersion: now.version,
      state: "closed",
      reason: "another_school",
      note: "Chose a school nearer home.",
    });
    now = await api.admissions.enquiry({ id: listed.id });
    expect(now).toMatchObject({
      state: "closed",
      closedReason: "another_school",
    });
    expect(now.moves).toEqual(["in_progress"]);
    await api.admissions.moveEnquiry({
      id: listed.id,
      expectedVersion: closed.version,
      state: "in_progress",
    });
    now = await api.admissions.enquiry({ id: listed.id });
    expect(now).toMatchObject({ state: "in_progress", closedReason: null });
    const changes = (await api.messages.thread({ id: threadId })).messages;
    expect(changes.at(-2)).toMatchObject({
      kind: "event",
      body: "Chose a school nearer home.",
      details: { from: "in_progress", to: "closed", reason: "another_school" },
    });
    expect(changes.at(-1)).toMatchObject({
      kind: "event",
      details: { from: "closed", to: "in_progress" },
    });
  });

  test("the inbox finds a family however the Arabic name is typed", async () => {
    const { api } = await officer();
    const logged = await api.admissions.logEnquiry({
      source: "phone",
      purpose: "visit",
      locale: "ar",
      name: "أحمد سالم المدرسة",
      email: "",
      phone: "01012345678",
      childName: "",
      childYear: "",
      message: "يسأل عن الجولات.",
      assigneeId: "",
    });
    const found = await api.admissions.enquiries({
      state: "all",
      q: "احمد سالم المدرسه",
    });
    expect(found.rows.map((row) => row.id)).toContain(logged.id);
  });

  test("a reply from a school template goes to the family by email and stays in the conversation", async () => {
    const { mail, dependencies } = seeded();
    const { api } = await officer();
    const logged = await api.admissions.logEnquiry({
      source: "walk_in",
      purpose: "visit",
      locale: "ar",
      name: "سلامة عشوش",
      email: "salama.walkin@example.com",
      phone: "",
      childName: "مريم",
      childYear: "KG1",
      message: "زارت المدرسة وتود حجز جولة.",
      assigneeId: "",
    });
    const before = await api.admissions.enquiry({ id: logged.id });
    expect(before).toMatchObject({
      source: "walk_in",
      state: "open",
      createdBy: { id: expect.any(String) },
    });
    const threadId = before.threadId ?? "";
    const opened = await api.messages.thread({ id: threadId });
    expect(opened.messages.map((entry) => [entry.kind, entry.body])).toEqual([
      ["meeting", "زارت المدرسة وتود حجز جولة."],
    ]);
    expect(opened.emailsOutside).toBe(true);
    expect(opened.subject).toBe("زيارتكم إلى كلية نورثويند الدولية");

    const templates = await api.templates.list({ kind: "message" });
    const visit = templates.find((row) => row.title === "ترتيب زيارة");
    if (!visit) throw new Error("the school has no visit reply");
    const template = await api.templates.open({ id: visit.id });
    const words = fillFields(template.content, {
      name: "سلامة",
      child: "مريم",
      school: "نورث ويند",
      sender: "المكتب",
    });
    await api.messages.send({
      threadId,
      content: words,
      after: opened.latestId ?? "",
    });

    const delivered = await deliverTenant(
      dependencies.cell,
      { email: mail, sms: null },
      seeded().tenants[0]?.tenantId ?? "",
    );
    expect(delivered.sent).toBeGreaterThan(0);
    const email = mail.sent.findLast(
      (item) => item.to === "salama.walkin@example.com",
    );
    expect(email).toMatchObject({
      subject: "زيارتكم إلى كلية نورثويند الدولية",
      fromName: expect.any(String),
    });
    expect(email?.text).toContain("نشكركم على طلب الزيارة");
    expect(email?.html).toContain('dir="rtl"');
    const after = await api.admissions.enquiry({ id: logged.id });
    expect(after.state).toBe("in_progress");
    expect(after.firstRespondedAt).not.toBeNull();
  });

  test("an enquiry logged by hand needs a way to reach the family, and tells whoever it is handed to", async () => {
    const { api } = await principal();
    expect(
      await rejection(
        api.admissions.logEnquiry({
          source: "phone",
          purpose: "enquiry",
          locale: "en",
          name: "Salama Ashoush",
          email: "",
          phone: "",
          childName: "",
          childYear: "",
          message: "",
          assigneeId: "",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const officeSession = await officer();
    const office = await officeSession.api.identity.currentUser();
    const teaching = await (await teacher()).api.identity.currentUser();
    expect(
      await rejection(
        api.admissions.logEnquiry({
          source: "event",
          purpose: "enquiry",
          locale: "en",
          name: "Salama Ashoush",
          email: "salama.fair@example.com",
          phone: "",
          childName: "",
          childYear: "",
          message: "",
          assigneeId: teaching.id,
        }),
      ),
    ).toMatchObject({ message: "enquiry.assignee" });
    const logged = await api.admissions.logEnquiry({
      source: "event",
      purpose: "enquiry",
      locale: "en",
      name: "Salama Ashoush (fair)",
      email: "salama.fair@example.com",
      phone: "",
      childName: "",
      childYear: "",
      message: "Met at the schools fair.",
      assigneeId: office.id,
    });
    const notices = await officeSession.api.notifications.list({ tab: "all" });
    expect(
      notices.rows.find(
        (row) => row.kind === "enquiry" && row.subjectId === logged.id,
      ),
    ).toMatchObject({
      params: { assigned: true, title: "Salama Ashoush (fair)" },
    });
    const again = await api.admissions.logEnquiry({
      source: "phone",
      purpose: "visit",
      locale: "en",
      name: "Salama Ashoush (again)",
      email: "Salama.Fair@example.com",
      phone: "",
      childName: "",
      childYear: "",
      message: "",
      assigneeId: "",
    });
    const page = await api.admissions.enquiry({ id: again.id });
    expect(page.related.map((row) => row.id)).toEqual([logged.id]);
  });
});
