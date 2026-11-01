import type { SectionOf } from "@faridalms/domain/website";
import type { RouterClient } from "@orpc/server";

import { newSection } from "@faridalms/domain/website";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, test } from "bun:test";

import type { AppRouter } from "../src/router";

import { createTurnstile } from "../src/core/turnstile";
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
const FORM_ID = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d00";

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
      questions: [
        {
          id: QUESTIONS.heard,
          label: ar ? "كيف عرفت عنا؟" : "How did you hear about us?",
          hint: "",
          answer: "choice",
          required: "required",
          options: ar ? "صديق\nوسائل التواصل" : "A friend\nSocial media",
        },
        {
          id: QUESTIONS.start,
          label: ar ? "تاريخ البدء" : "Hoped-for start",
          hint: "",
          answer: "date",
          required: "optional",
          options: "",
        },
        {
          id: QUESTIONS.siblings,
          label: ar ? "عدد الإخوة" : "Brothers and sisters",
          hint: "",
          answer: "number",
          required: "optional",
          options: "",
        },
      ],
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
  answers: { [QUESTIONS.heard]: "A friend" },
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
            answers: { [QUESTIONS.heard]: "A newspaper" },
          }),
        ),
      ),
    ).toMatchObject({ message: "validation.invalid" });
    expect(
      await rejection(
        site.submitEnquiry(
          sent("Not a day", {
            answers: {
              [QUESTIONS.heard]: "A friend",
              [QUESTIONS.start]: "2027-02-30",
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
            [QUESTIONS.heard]: "Social media",
            [QUESTIONS.start]: "2027-01-10",
            [QUESTIONS.siblings]: "٢",
            "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3dff": "not asked",
          },
        }),
      ),
    ).toEqual({ received: true });
    await visitorFrom("192.0.2.11").submitEnquiry(
      sent("سلامة عشوش (نموذج)", {
        locale: "ar",
        answers: { [QUESTIONS.heard]: "صديق" },
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
        label: "How did you hear about us?",
        kind: "choice",
        value: "Social media",
      },
      {
        id: QUESTIONS.start,
        label: "Hoped-for start",
        kind: "date",
        value: "2027-01-10",
      },
      {
        id: QUESTIONS.siblings,
        label: "Brothers and sisters",
        kind: "number",
        value: "2",
      },
    ]);
    const arabic = await api.admissions.enquiry({
      id: (await findEnquiry("سلامة عشوش (نموذج)")).id,
    });
    expect(arabic.locale).toBe("ar");
    expect(arabic.answers).toEqual([
      {
        id: QUESTIONS.heard,
        label: "كيف عرفت عنا؟",
        kind: "choice",
        value: "صديق",
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

    await api.admissions.addEnquiryEntry({
      id: listed.id,
      kind: "note",
      body: "Prefers a call after four.",
    });
    let now = await api.admissions.enquiry({ id: listed.id });
    expect(now.state).toBe("open");
    expect(now.firstRespondedAt).toBeNull();

    await api.admissions.addEnquiryEntry({
      id: listed.id,
      kind: "call",
      body: "Called; a tour on Tuesday suits them.",
    });
    now = await api.admissions.enquiry({ id: listed.id });
    expect(now.state).toBe("in_progress");
    expect(now.firstRespondedAt).not.toBeNull();
    expect(now.thread.map((entry) => entry.kind)).toEqual([
      "assigned",
      "note",
      "call",
      "state",
    ]);
    expect(now.version).toBeGreaterThan(assigned.version);
    expect(now.canEmail).toBe(false);
    expect(
      await rejection(
        api.admissions.replyToEnquiry({
          id: listed.id,
          locale: "en",
          subject: "Hello",
          body: "Hello",
        }),
      ),
    ).toMatchObject({ message: "enquiry.no_email" });

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
    expect(now.thread.at(-1)).toMatchObject({
      kind: "state",
      details: { from: "closed", to: "in_progress" },
    });
  });

  test("a reply goes to the family by email from a template and is kept in the thread", async () => {
    const { mail } = seeded();
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
      canEmail: true,
      createdBy: { id: expect.any(String) },
    });
    const reply = await api.admissions.replyToEnquiry({
      id: logged.id,
      template: "visit",
      locale: "ar",
      subject: "زيارة المدرسة",
      body: "مرحبًا سلامة، يسعدنا استقبالكم يوم الثلاثاء.",
    });
    const email = mail.sent.find(
      (item) => item.reference === `enquiry/${reply.id}`,
    );
    expect(email).toMatchObject({
      to: "salama.walkin@example.com",
      subject: "زيارة المدرسة",
      text: "مرحبًا سلامة، يسعدنا استقبالكم يوم الثلاثاء.",
    });
    const after = await api.admissions.enquiry({ id: logged.id });
    expect(after.state).toBe("in_progress");
    expect(after.thread[0]).toMatchObject({
      kind: "reply",
      body: "مرحبًا سلامة، يسعدنا استقبالكم يوم الثلاثاء.",
      details: { subject: "زيارة المدرسة", locale: "ar", template: "visit" },
    });

    const failing = await api.admissions.logEnquiry({
      source: "phone",
      purpose: "enquiry",
      locale: "en",
      name: "Salama Ashoush",
      email: "fail-always@example.com",
      phone: "",
      childName: "",
      childYear: "",
      message: "",
      assigneeId: "",
    });
    expect(
      await rejection(
        api.admissions.replyToEnquiry({
          id: failing.id,
          locale: "en",
          subject: "Hello",
          body: "Hello",
        }),
      ),
    ).toMatchObject({ message: "enquiry.not_sent" });
    const untouched = await api.admissions.enquiry({ id: failing.id });
    expect(untouched).toMatchObject({ state: "open", thread: [] });
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
