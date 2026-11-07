import { PLATFORM_PALETTE } from "@faridalms/domain/site-theme";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const theme = readFileSync("packages/ui/src/theme.css", "utf8");

const token = (name: string) =>
  new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(theme)?.[1];

describe("the platform's green", () => {
  it("is one set of colours for the app and a school's unstyled sign-in page", () => {
    expect(token("brand")).toBe(PLATFORM_PALETTE.primary);
    expect(token("brand-surface")).toBe(PLATFORM_PALETTE.surface);
    expect(token("brand-sage")).toBe(PLATFORM_PALETTE.accent);
    expect(token("brand-text")).toBe(PLATFORM_PALETTE.ink);
  });
});
