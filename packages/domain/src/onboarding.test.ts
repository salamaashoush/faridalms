import { describe, expect, it } from "vitest";

import type { OnboardingItem } from "./onboarding";

import {
  healthOf,
  ONBOARDING_ITEMS,
  ONBOARDING_SOURCE,
  onboardingItems,
  onboardingStalled,
  OPERATOR_ITEMS,
  setupFinished,
  setupProgress,
} from "./onboarding";

const day = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("a school's onboarding", () => {
  it("asks only for the steps its modules allow, and payment once past a trial", () => {
    const trial = onboardingItems({ modules: ["attendance"], onTrial: true });
    expect(trial).toContain("first_register");
    expect(trial).not.toContain("first_assignment");
    expect(trial).not.toContain("website_published");
    expect(trial).not.toContain("first_invoice_paid");
    expect(trial).toContain("kickoff_call");
    expect(onboardingItems({ modules: ["website"], onTrial: false })).toEqual(
      expect.arrayContaining(["website_published", "first_invoice_paid"]),
    );
  });

  it("stalls a fortnight after its last step, and never once every step is taken", () => {
    const applies: OnboardingItem[] = ["admin_signed_in", "classes"];
    const createdAt = day("2026-10-01");
    const taken = new Map<OnboardingItem, Date>([
      ["admin_signed_in", day("2026-10-10")],
    ]);
    const at = (now: string, reached = taken) =>
      onboardingStalled({ applies, reached, createdAt, now: day(now) });
    expect(at("2026-10-24")).toBe(false);
    expect(at("2026-10-25")).toBe(true);
    expect(at("2026-10-12", new Map())).toBe(false);
    expect(at("2026-10-16", new Map())).toBe(true);
    expect(
      at(
        "2027-01-01",
        new Map([...taken, ["classes", day("2026-10-11")] as const]),
      ),
    ).toBe(false);
  });

  it("lets an operator tick exactly the steps only an operator can see", () => {
    expect([...OPERATOR_ITEMS].toSorted()).toEqual(
      ONBOARDING_ITEMS.filter(
        (item) => ONBOARDING_SOURCE[item] === "operator",
      ).toSorted(),
    );
  });
});

describe("a school's own setup", () => {
  it("lists its steps in order, leaving out those its modules do not have", () => {
    const applies = onboardingItems({ modules: ["website"], onTrial: true });
    expect(setupProgress(applies, new Set()).map((step) => step.id)).toEqual([
      "details",
      "year",
      "classes",
      "staff",
      "students",
      "website",
    ]);
  });

  it("counts a step done only once every one of its items is", () => {
    const applies = onboardingItems({ modules: [], onTrial: true });
    const students = (done: OnboardingItem[]) =>
      setupProgress(applies, new Set(done)).find(
        (step) => step.id === "students",
      )?.done;
    expect(students(["students_imported"])).toBe(false);
    expect(students(["students_imported", "guardians_linked"])).toBe(true);
  });

  it("is finished without the optional website and admissions", () => {
    const applies = onboardingItems({
      modules: ["timetable", "website", "admissions"],
      onTrial: true,
    });
    const required: OnboardingItem[] = [
      "school_details",
      "year_ready",
      "classes",
      "staff_invited",
      "students_imported",
      "guardians_linked",
    ];
    expect(setupFinished(setupProgress(applies, new Set(required)))).toBe(
      false,
    );
    expect(
      setupFinished(
        setupProgress(applies, new Set([...required, "timetable_ready"])),
      ),
    ).toBe(true);
  });
});

describe("a school's health", () => {
  const well = {
    signedIn7d: 40,
    schoolDays7d: 5,
    daysOverdue: 0,
    onboardingStalled: false,
    hostFailing: false,
    failedDeliveries1d: 0,
  };

  it("is green when nothing is wrong", () => {
    expect(healthOf(well)).toEqual({ level: "green", reasons: [] });
  });

  it("is red when nobody signs in through a week of school, not a holiday week", () => {
    expect(healthOf({ ...well, signedIn7d: 0 }).level).toBe("red");
    expect(healthOf({ ...well, signedIn7d: 0, schoolDays7d: 1 }).level).toBe(
      "green",
    );
    expect(
      healthOf({ ...well, signedIn7d: null, schoolDays7d: null }).level,
    ).toBe("green");
  });

  it("is red past a month overdue, and amber for what an operator can mend", () => {
    expect(healthOf({ ...well, daysOverdue: 30 }).level).toBe("green");
    expect(healthOf({ ...well, daysOverdue: 31 })).toEqual({
      level: "red",
      reasons: ["invoice_overdue"],
    });
    expect(
      healthOf({
        ...well,
        onboardingStalled: true,
        hostFailing: true,
        failedDeliveries1d: 3,
      }),
    ).toEqual({
      level: "amber",
      reasons: ["onboarding_stalled", "host_failing", "deliveries_failing"],
    });
  });
});
