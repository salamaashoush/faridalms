import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { requirePage } from "./page-access";

const thrown = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
};

describe("a page opens only to those it is for", () => {
  it("lets in anyone holding one of the page's capabilities", () => {
    const office = {
      workspace: "staff" as const,
      capabilities: ["admissions:read" as const],
    };
    expect(
      thrown(() => requirePage(office, "admissions:manage", "admissions:read")),
    ).toBeNull();
  });

  it("sends anyone else to their own home", () => {
    const family = {
      workspace: "family" as const,
      capabilities: ["children:read" as const],
    };
    const refusal = thrown(() => requirePage(family, "news:manage"));
    expect(isRedirect(refusal)).toBe(true);
    expect(refusal).toMatchObject({ options: { to: "/family" } });
  });
});
