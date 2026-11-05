import { describe, expect, it } from "vitest";

import { signIntake, verifyIntake } from "./intake";

const secret = Buffer.alloc(32, 7).toString("base64");

describe("a signed intake", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const timestamp = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify({ name: "Salama Ashoush" });

  it("is taken when signed with the secret within the tolerance", () => {
    const signature = signIntake({ secret, timestamp, body });
    expect(
      verifyIntake({
        secret,
        timestamp: String(timestamp),
        signature,
        body,
        now,
      }),
    ).toBe(true);
  });

  it("is refused changed, old, signed otherwise or unsigned", () => {
    const signature = signIntake({ secret, timestamp, body });
    const check = (changes: Partial<Parameters<typeof verifyIntake>[0]>) =>
      verifyIntake({
        secret,
        timestamp: String(timestamp),
        signature,
        body,
        now,
        ...changes,
      });
    expect(check({ body: `${body} ` })).toBe(false);
    expect(check({ now: new Date(now.getTime() + 301_000) })).toBe(false);
    expect(check({ secret: Buffer.alloc(32, 8).toString("base64") })).toBe(
      false,
    );
    expect(check({ signature: null })).toBe(false);
    expect(check({ timestamp: "soon" })).toBe(false);
  });
});
