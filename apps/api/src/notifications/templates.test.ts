import { describe, expect, it } from "vitest";

import { render } from "./templates";

const absence = {
  kind: "absence" as const,
  params: { studentName: "Salama", studentNameAr: "سلامة", date: "2026-09-14" },
};

describe("notice emails", () => {
  it("write the day in the reader's language, not as the database stores it", () => {
    const english = render({
      locale: "en",
      digits: "latn",
      channel: "email",
      school: "Acme School",
      items: [absence],
    });
    expect(english.text).toContain(
      "Salama was marked absent on September 14, 2026.",
    );
    expect(english.text).not.toContain("2026-09-14");
  });

  it("write the day in Arabic in the school's digits", () => {
    const arab = render({
      locale: "ar",
      digits: "arab",
      channel: "email",
      school: "مدرسة أكمي",
      items: [absence],
    });
    expect(arab.text).toContain("سُجّل غياب سلامة يوم ١٤ سبتمبر ٢٠٢٦");
    const western = render({
      locale: "ar",
      digits: "latn",
      channel: "sms",
      school: "مدرسة أكمي",
      items: [absence],
    });
    expect(western.text).toContain("14 سبتمبر 2026");
  });
});

const feedbackLine = (params: Record<string, unknown>, locale: "en" | "ar") =>
  render({
    locale,
    digits: "latn",
    channel: "sms",
    school: "Acme",
    items: [{ kind: "feedback", params: { title: "Letters home", ...params } }],
  }).text;

describe("teaching notices", () => {
  const assigned = {
    kind: "assignment" as const,
    params: {
      title: "Letters home",
      titleAr: "رسائل إلى البيت",
      className: "Arabic 5A",
      classNameAr: "العربية ٥أ",
      date: "2026-11-12",
    },
  };

  it("tell a student and a family about new work, naming the child to the family", () => {
    const student = render({
      locale: "en",
      digits: "latn",
      channel: "email",
      school: "Acme School",
      items: [assigned],
    });
    expect(student.subject).toBe(
      "Acme School: New work in Arabic 5A: Letters home, due November 12, 2026.",
    );
    const family = render({
      locale: "ar",
      digits: "latn",
      channel: "email",
      school: "مدرسة أكمي",
      items: [
        {
          ...assigned,
          params: {
            ...assigned.params,
            studentName: "Salama",
            studentNameAr: "سلامة",
          },
        },
      ],
    });
    expect(family.text).toContain(
      "واجب جديد لـسلامة في العربية ٥أ: رسائل إلى البيت",
    );
  });

  it("say whether returned work was marked or sent back to revise", () => {
    expect(feedbackLine({}, "en")).toBe(
      "Acme: Your work on Letters home came back with your teacher's feedback.",
    );
    expect(feedbackLine({ revise: true, studentName: "Salama" }, "en")).toBe(
      "Acme: Salama's work on Letters home came back to revise.",
    );
    expect(feedbackLine({ studentNameAr: "سلامة" }, "ar")).toBe(
      "Acme: صُحِّح عمل سلامة في Letters home وأُعيد إليه.",
    );
  });

  it("announce a period's grades in the reader's language", () => {
    const grades = {
      kind: "grades" as const,
      params: { title: "Term 1", titleAr: "الفصل الأول", className: "Science" },
    };
    expect(
      render({
        locale: "ar",
        digits: "latn",
        channel: "sms",
        school: "Acme",
        items: [grades],
      }).text,
    ).toBe("Acme: صدرت درجاتك عن الفصل الأول في Science.");
  });

  it("say a mention came in a comment, with the passage and the words", () => {
    const comment = {
      kind: "mention" as const,
      params: {
        comment: true,
        actorName: "Salama Ashoush",
        actorNameAr: "سلامة عشوش",
        title: "The Nile floods",
        preview: "Could you check this?",
      },
    };
    expect(
      render({
        locale: "en",
        digits: "latn",
        channel: "email",
        school: "Acme School",
        items: [comment],
      }).text,
    ).toContain(
      'Salama Ashoush mentioned you in a comment on "The Nile floods": Could you check this?',
    );
    expect(
      render({
        locale: "ar",
        digits: "latn",
        channel: "email",
        school: "مدرسة أكمي",
        items: [comment],
      }).text,
    ).toContain("ذكرك سلامة عشوش في تعليق على «The Nile floods»");
  });
});
