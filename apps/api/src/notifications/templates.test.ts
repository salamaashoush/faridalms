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
