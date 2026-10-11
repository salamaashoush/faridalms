import { describe, expect, it } from "vitest";

import { fullName, leaverAccessEnd, studentStatus } from "./people";
import { toE164 } from "./phone";

const year = {
  validFrom: "2026-09-13",
  validTo: "2027-06-18",
  exitMeaning: null,
};

describe("studentStatus", () => {
  it("reads a current placement as enrolled and none as unplaced", () => {
    expect(studentStatus([year], "2026-10-01")).toBe("enrolled");
    expect(studentStatus([], "2026-10-01")).toBe("unplaced");
  });

  it("reads only a future placement as pre-enrolled", () => {
    expect(studentStatus([year], "2026-09-01")).toBe("pre_enrolled");
  });

  it("reads the latest placement's exit as left or graduated", () => {
    expect(
      studentStatus([{ ...year, exitMeaning: "graduated" }], "2027-07-01"),
    ).toBe("graduated");
    expect(
      studentStatus([{ ...year, exitMeaning: "withdrawn" }], "2027-07-01"),
    ).toBe("left");
  });

  it("keeps a student whose year ended without an exit enrolled over the summer", () => {
    expect(studentStatus([year], "2027-07-15")).toBe("enrolled");
  });
});

describe("fullName", () => {
  it("joins the parts that are present", () => {
    expect(fullName({ given: "Omar", middle: null, family: "Nasser" })).toBe(
      "Omar Nasser",
    );
    expect(fullName({ given: null, middle: null, family: null })).toBeNull();
  });
});

describe("toE164", () => {
  it("reads a national number in the school's country", () => {
    expect(toE164("0100 000 0003", "EG")).toBe("+201000000003");
    expect(toE164("050 123 4567", "AE")).toBe("+971501234567");
  });

  it("keeps an international number whatever the country", () => {
    expect(toE164("+20 (0)100 000 0003", "AE")).toBe("+201000000003");
    expect(toE164("0020 100 000 0003", "SA")).toBe("+201000000003");
  });

  it("refuses what cannot be a number", () => {
    expect(toE164("call me", "EG")).toBeNull();
    expect(toE164("12", "EG")).toBeNull();
  });
});

describe("how long a leaver stays a student to the app", () => {
  const leaving = {
    years: [{ startsOn: "2026-09-13" }, { startsOn: "2027-09-12" }],
    year: { endsBefore: "2027-06-18" },
    left: "2026-10-11",
  };

  it("is to the day the next school year begins, summer included", () => {
    expect(leaverAccessEnd({ ...leaving, access: "year_end" })).toBe(
      "2027-09-12",
    );
  });

  it("is to the end of their year where the school has set up no later one", () => {
    expect(
      leaverAccessEnd({
        ...leaving,
        years: [{ startsOn: "2026-09-13" }],
        access: "year_end",
      }),
    ).toBe("2027-06-18");
  });

  it("is no longer than the last day when the office says so", () => {
    expect(leaverAccessEnd({ ...leaving, access: "last_day" })).toBe(
      "2026-10-11",
    );
  });
});
