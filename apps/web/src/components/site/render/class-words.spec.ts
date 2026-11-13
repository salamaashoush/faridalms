import { describe, expect, it } from "vitest";

import { classLengthWords, classWhenWords, teacherWords } from "./class-words";

const TODAY = "2026-11-14";

describe("a class's dates in words", () => {
  it("says when a class starts, without the year in this one", () => {
    expect(
      classWhenWords({ startsOn: "2026-12-06", endsOn: null }, TODAY, "en"),
    ).toBe("Starts December 6");
    expect(
      classWhenWords({ startsOn: "2026-12-06", endsOn: null }, TODAY, "ar"),
    ).toBe("يبدأ في 6 ديسمبر");
    expect(
      classWhenWords({ startsOn: "2027-01-10", endsOn: null }, TODAY, "en"),
    ).toBe("Starts January 10, 2027");
  });

  it("says a running class that never stops enrolling may be joined any time", () => {
    expect(
      classWhenWords({ startsOn: "2026-09-01", endsOn: null }, TODAY, "en"),
    ).toBe("Running now, joins any time");
    expect(
      classWhenWords({ startsOn: "2026-09-01", endsOn: null }, TODAY, "ar"),
    ).toBe("قائم الآن، والانضمام متاح في أي وقت");
  });

  it("says until when a running class runs, and nothing once it has ended", () => {
    expect(
      classWhenWords(
        { startsOn: "2026-09-01", endsOn: "2026-12-20" },
        TODAY,
        "en",
      ),
    ).toBe("Running now, until December 20");
    expect(
      classWhenWords(
        { startsOn: "2026-09-01", endsOn: "2026-12-20" },
        TODAY,
        "ar",
      ),
    ).toBe("قائم الآن حتى 20 ديسمبر");
    for (const locale of ["en", "ar"] as const)
      expect(
        classWhenWords(
          { startsOn: "2026-01-01", endsOn: "2026-06-30" },
          TODAY,
          locale,
        ),
      ).toBe("");
  });

  it("says how long a class runs, and who teaches it", () => {
    const tenWeeks = { startsOn: "2026-12-06", endsOn: "2027-02-13" };
    expect(classLengthWords(tenWeeks, "en")).toBe("10 weeks");
    expect(classLengthWords(tenWeeks, "ar")).toBe("10 أسابيع");
    expect(
      classLengthWords({ startsOn: "2026-12-06", endsOn: "2026-12-12" }, "en"),
    ).toBe("One week");
    expect(
      classLengthWords({ startsOn: "2026-12-06", endsOn: null }, "en"),
    ).toBe("");
    expect(teacherWords(["Amal", "Omar"], "en")).toBe("With Amal and Omar");
    expect(teacherWords(["أمل", "عمر"], "ar")).toBe("مع أمل وعمر");
    expect(teacherWords([], "en")).toBe("");
  });
});
