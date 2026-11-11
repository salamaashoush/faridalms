import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  deliveryTime,
  preferencesOf,
  retryDelayMs,
} from "./notifications";

describe("retryDelayMs", () => {
  it("backs off and stops after the last allowed attempt", () => {
    expect(retryDelayMs(0)).toBe(60_000);
    expect(retryDelayMs(1)).toBe(5 * 60_000);
    expect(retryDelayMs(3)).toBe(2 * 3_600_000);
    expect(retryDelayMs(5)).toBeNull();
    expect(retryDelayMs(9)).toBeNull();
  });

  it("scales with the configured base", () => {
    expect(retryDelayMs(0, 1000)).toBe(1000);
    expect(retryDelayMs(2, 1000)).toBe(30_000);
  });
});

const cairo = { timeZone: "Africa/Cairo", weekendDays: [5, 6] };

describe("delivery time", () => {
  it("sends an instant notice at once outside quiet hours", () => {
    const now = new Date("2026-10-01T09:00:00Z");
    expect(
      deliveryTime({
        kind: "message",
        channel: "email",
        preferences: DEFAULT_PREFERENCES,
        school: cairo,
        now,
      }),
    ).toEqual({ mode: "instant", at: now });
  });

  it("holds a notice sent in quiet hours until they end, but not an urgent one", () => {
    const now = new Date("2026-10-01T20:30:00Z");
    expect(
      deliveryTime({
        kind: "message",
        channel: "email",
        preferences: DEFAULT_PREFERENCES,
        school: cairo,
        now,
      })?.at.toISOString(),
    ).toBe("2026-10-02T04:00:00.000Z");
    expect(
      deliveryTime({
        kind: "urgent",
        channel: "sms",
        preferences: DEFAULT_PREFERENCES,
        school: cairo,
        now,
      })?.at,
    ).toEqual(now);
  });

  it("gathers digest items for the evening digest, tomorrow once it has passed", () => {
    const morning = deliveryTime({
      kind: "announcement",
      channel: "email",
      preferences: DEFAULT_PREFERENCES,
      school: cairo,
      now: new Date("2026-10-01T07:00:00Z"),
    });
    expect(morning?.mode).toBe("digest");
    expect(morning?.at.toISOString()).toBe("2026-10-01T15:00:00.000Z");
    expect(
      deliveryTime({
        kind: "announcement",
        channel: "email",
        preferences: DEFAULT_PREFERENCES,
        school: cairo,
        now: new Date("2026-10-01T16:00:00Z"),
      })?.at.toISOString(),
    ).toBe("2026-10-02T15:00:00.000Z");
  });

  it("waits out a muted weekend and respects channels turned off", () => {
    const quietWeekend = { ...DEFAULT_PREFERENCES, weekendMute: true };
    expect(
      deliveryTime({
        kind: "message",
        channel: "email",
        preferences: quietWeekend,
        school: cairo,
        now: new Date("2026-10-02T09:00:00Z"),
      })?.at.toISOString(),
    ).toBe("2026-10-04T04:00:00.000Z");
    expect(
      deliveryTime({
        kind: "announcement",
        channel: "sms",
        preferences: DEFAULT_PREFERENCES,
        school: cairo,
        now: new Date(),
      }),
    ).toBeNull();
  });

  it("delays by the notice delay before anything else", () => {
    expect(
      deliveryTime({
        kind: "absence",
        channel: "sms",
        preferences: DEFAULT_PREFERENCES,
        school: cairo,
        now: new Date("2026-10-01T08:00:00Z"),
        delayMinutes: 30,
      })?.at.toISOString(),
    ).toBe("2026-10-01T08:30:00.000Z");
  });
});

describe("stored preferences", () => {
  it("fall back to the defaults when a stored value no longer fits", () => {
    expect(preferencesOf({ email: "yes" })).toEqual(DEFAULT_PREFERENCES);
    expect(preferencesOf(DEFAULT_PREFERENCES)).toEqual(DEFAULT_PREFERENCES);
  });

  it("keep a person's choices when a kind is added after they chose", () => {
    const { consent: _email, ...email } = {
      ...DEFAULT_PREFERENCES.email,
      announcement: "off" as const,
    };
    const { consent: _sms, ...sms } = DEFAULT_PREFERENCES.sms;
    const read = preferencesOf({ ...DEFAULT_PREFERENCES, email, sms });
    expect(read.email.announcement).toBe("off");
    expect(read.email.consent).toBe(DEFAULT_PREFERENCES.email.consent);
  });
});
