import { describe, expect, it } from "vitest";

import {
  formatDayIn,
  formatDayRangeIn,
  formatHijriIn,
  formatInstantIn,
  formatListIn,
  formatMonthIn,
  formatSpanIn,
  formatTimeIn,
  formatWeekdayIn,
  writingOf,
} from "./date-text";

const CAIRO = "Africa/Cairo";
const RLM = "‏";

describe("how a locale tag writes dates", () => {
  it("reads the language and the digits it names", () => {
    expect(writingOf("en")).toEqual({ language: "en", digits: "latn" });
    expect(writingOf("ar-u-nu-latn")).toEqual({
      language: "ar",
      digits: "latn",
    });
    expect(writingOf("ar-u-nu-arab")).toEqual({
      language: "ar",
      digits: "arab",
    });
    expect(writingOf("ar")).toEqual({ language: "ar", digits: "arab" });
  });
});

describe("calendar days", () => {
  it("are written in each English style", () => {
    const day = "2026-09-14";
    expect(formatDayIn(day, "medium", "en")).toBe("Sep 14, 2026");
    expect(formatDayIn(day, "weekday", "en")).toBe("Monday, September 14");
    expect(formatDayIn(day, "full", "en")).toBe("September 14, 2026");
    expect(formatDayIn(day, "dayMonth", "en")).toBe("September 14");
    expect(formatDayIn(day, "short", "en")).toBe("Sep 14");
    expect(formatDayIn(day, "day", "en")).toBe("14");
  });

  it("are written in each Arabic style, in the school's digits", () => {
    const day = "2026-11-06";
    expect(formatDayIn(day, "medium", "ar-u-nu-latn")).toBe(
      `06${RLM}/11${RLM}/2026`,
    );
    expect(formatDayIn(day, "weekday", "ar-u-nu-latn")).toBe(
      "الجمعة، 6 نوفمبر",
    );
    expect(formatDayIn(day, "full", "ar-u-nu-latn")).toBe("6 نوفمبر 2026");
    expect(formatDayIn(day, "short", "ar-u-nu-latn")).toBe("6 نوفمبر");
    expect(formatDayIn(day, "full", "ar-u-nu-arab")).toBe("٦ نوفمبر ٢٠٢٦");
  });

  it("keep their day whatever comes after it in the string", () => {
    expect(formatDayIn("2027-01-31T23:00:00.000Z", "short", "en")).toBe(
      "Jan 31",
    );
  });
});

describe("ranges of days", () => {
  it("share the month and year their ends share", () => {
    expect(formatDayRangeIn("2026-09-07", "2026-09-25", "medium", "en")).toBe(
      "Sep 7 – 25, 2026",
    );
    expect(formatDayRangeIn("2026-09-07", "2026-10-02", "medium", "en")).toBe(
      "Sep 7 – Oct 2, 2026",
    );
    expect(formatDayRangeIn("2026-12-28", "2027-01-02", "medium", "en")).toBe(
      "Dec 28, 2026 – Jan 2, 2027",
    );
    expect(formatDayRangeIn("2026-12-28", "2027-01-02", "short", "en")).toBe(
      "Dec 28, 2026 – Jan 2, 2027",
    );
    expect(formatDayRangeIn("2026-09-07", "2026-09-07", "medium", "en")).toBe(
      "Sep 7, 2026",
    );
  });

  it("are written in Arabic order", () => {
    expect(
      formatDayRangeIn("2026-09-07", "2026-09-25", "full", "ar-u-nu-latn"),
    ).toBe("7 – 25 سبتمبر 2026");
    expect(
      formatDayRangeIn("2026-09-07", "2026-10-02", "full", "ar-u-nu-latn"),
    ).toBe("7 سبتمبر – 2 أكتوبر 2026");
    expect(
      formatDayRangeIn("2026-09-07", "2026-09-25", "weekday", "ar-u-nu-latn"),
    ).toBe("الاثنين، 7 – الجمعة، 25 سبتمبر");
  });

  it("name the months of day numbers that cross one", () => {
    expect(formatDayRangeIn("2026-09-28", "2026-10-02", "day", "en")).toBe(
      "Sep 28 – Oct 2",
    );
    expect(formatDayRangeIn("2026-09-07", "2026-09-25", "day", "en")).toBe(
      "7 – 25",
    );
  });

  it("name the years of weekdays in different ones", () => {
    expect(formatDayRangeIn("2026-12-30", "2027-01-02", "weekday", "en")).toBe(
      "Wednesday, December 30, 2026 – Saturday, January 2, 2027",
    );
  });
});

describe("instants", () => {
  const at = "2026-11-06T20:11:00Z";

  it("are written on the zone's clock in each English style", () => {
    expect(formatInstantIn(at, "full", CAIRO, "en")).toBe(
      "Fri, Nov 6, 10:11 PM",
    );
    expect(formatInstantIn(at, "stamp", CAIRO, "en")).toBe("Nov 6, 10:11 PM");
    expect(formatInstantIn(at, "medium", CAIRO, "en")).toBe(
      "Nov 6, 2026, 10:11 PM",
    );
    expect(formatInstantIn(at, "date", CAIRO, "en")).toBe("Nov 6, 2026");
    expect(formatInstantIn(at, "short", CAIRO, "en")).toBe("Nov 6");
    expect(formatInstantIn(at, "time", CAIRO, "en")).toBe("10:11 PM");
  });

  it("are written in Arabic with a plain space before the period", () => {
    expect(formatInstantIn(at, "full", CAIRO, "ar-u-nu-latn")).toBe(
      "الجمعة، 6 نوفمبر، 10:11 م",
    );
    expect(formatInstantIn(at, "medium", CAIRO, "ar-u-nu-latn")).toBe(
      `06${RLM}/11${RLM}/2026، 10:11 م`,
    );
    expect(formatInstantIn(at, "time", CAIRO, "ar-u-nu-arab")).toBe("١٠:١١ م");
  });

  it("fall on the zone's day, not the instant's UTC one", () => {
    expect(
      formatInstantIn("2026-09-20T21:30:00Z", "short", "Asia/Dubai", "en"),
    ).toBe("Sep 21");
  });

  it("read midnight and noon on a twelve-hour face", () => {
    expect(formatInstantIn("2026-01-01T00:05:00Z", "time", "UTC", "en")).toBe(
      "12:05 AM",
    );
    expect(formatInstantIn("2026-01-01T12:00:00Z", "time", "UTC", "en")).toBe(
      "12:00 PM",
    );
  });
});

describe("times of day", () => {
  it("are written on a twelve-hour face", () => {
    expect(formatTimeIn("08:30:00", "en")).toBe("8:30 AM");
    expect(formatTimeIn("14:05", "en")).toBe("2:05 PM");
    expect(formatTimeIn("14:05", "ar-u-nu-latn")).toBe("2:05 م");
  });
});

describe("spans of days with their hours", () => {
  const day = {
    startsOn: "2026-09-14",
    endsOn: "2026-09-14",
    startTime: null,
    endTime: null,
  };

  it("write one day, and its hours when timed", () => {
    expect(formatSpanIn(day, "long", "en")).toBe("Monday, September 14");
    expect(
      formatSpanIn(
        { ...day, startTime: "09:00:00", endTime: "10:30:00" },
        "short",
        "en",
      ),
    ).toBe("Mon, Sep 14, 09:00 – 10:30");
    expect(
      formatSpanIn(
        { ...day, startTime: "09:00", endTime: "10:30" },
        "long",
        "ar-u-nu-latn",
      ),
    ).toBe("الاثنين، 14 سبتمبر، 09:00 – 10:30");
  });

  it("write several days, sharing the month in Arabic", () => {
    const days = { ...day, endsOn: "2026-09-16" };
    expect(formatSpanIn(days, "short", "en")).toBe("Mon, Sep 14 – Wed, Sep 16");
    expect(formatSpanIn(days, "long", "ar-u-nu-latn")).toBe(
      "الاثنين، 14 – الأربعاء، 16 سبتمبر",
    );
    expect(
      formatSpanIn(
        { ...days, startTime: "09:00", endTime: "15:00" },
        "long",
        "en",
      ),
    ).toBe("Monday, September 14, 09:00 – Wednesday, September 16, 15:00");
  });

  it("name the years of a span across them", () => {
    expect(
      formatSpanIn(
        { ...day, startsOn: "2026-12-30", endsOn: "2027-01-02" },
        "long",
        "ar-u-nu-latn",
      ),
    ).toBe("الأربعاء، 30 ديسمبر 2026 – السبت، 2 يناير 2027");
  });
});

describe("months and weekdays", () => {
  it("are named alone", () => {
    expect(formatMonthIn("2026-09", "short", "en")).toBe("Sep");
    expect(formatMonthIn("2026-09-14", "label", "en")).toBe("September 2026");
    expect(formatMonthIn("2026-09", "label", "ar-u-nu-arab")).toBe(
      "سبتمبر ٢٠٢٦",
    );
    expect(formatWeekdayIn(1, "long", "en")).toBe("Monday");
    expect(formatWeekdayIn(7, "short", "en")).toBe("Sun");
    expect(formatWeekdayIn(5, "short", "ar-u-nu-latn")).toBe("الجمعة");
  });
});

describe("Hijri days", () => {
  it("are written from the calendar's own arithmetic", () => {
    expect(formatHijriIn("2026-09-14", "islamic-umalqura", "short", "en")).toBe(
      "Rab. II 3",
    );
    expect(
      formatHijriIn("2026-09-14", "islamic-umalqura", "dayMonth", "en"),
    ).toBe("Rabiʻ II 3");
    expect(formatHijriIn("2027-03-10", "islamic-umalqura", "full", "en")).toBe(
      "Shawwal 2, 1448 AH",
    );
    expect(
      formatHijriIn("2026-09-14", "islamic-civil", "full", "ar-u-nu-latn"),
    ).toBe("1 ربيع الآخر 1448 هـ");
    expect(
      formatHijriIn("2026-09-14", "islamic-umalqura", "short", "ar-u-nu-arab"),
    ).toBe("٣ ربيع الآخر");
  });
});

describe("lists", () => {
  it("join items with the language's word, leaving their digits alone", () => {
    expect(formatListIn(["a", "b", "c"], "and", "en")).toBe("a, b, and c");
    expect(formatListIn(["a", "b"], "and", "en")).toBe("a and b");
    expect(formatListIn(["a"], "and", "en")).toBe("a");
    expect(formatListIn(["a", "b", "c"], "or", "en")).toBe("a, b, or c");
    expect(formatListIn(["a", "b", "c"], "and", "ar-u-nu-arab")).toBe(
      "a وb وc",
    );
    expect(formatListIn(["a", "b", "c"], "or", "ar")).toBe("a أو b أو c");
    expect(formatListIn(["1 Flower", "2 Roots"], "unit", "en")).toBe(
      "1 Flower, 2 Roots",
    );
    expect(formatListIn(["أ", "ب"], "unit", "ar")).toBe("أ، ب");
  });
});
