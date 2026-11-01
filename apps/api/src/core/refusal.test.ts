import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { refusalResponse } from "./refusal";

describe("a raw route's refusal", () => {
  it("carries the refusal's own code, so the reader can word it", async () => {
    const answered = refusalResponse(
      new ORPCError("FORBIDDEN", { message: "file.quota_person" }),
      "request-1",
    );
    expect(answered.status).toBe(403);
    expect(await answered.json()).toEqual({
      code: "file.quota_person",
      requestId: "request-1",
    });
  });

  it("falls back to the status's code when the refusal names none", async () => {
    const answered = refusalResponse(new ORPCError("NOT_FOUND"), "request-2");
    expect(answered.status).toBe(404);
    expect(await answered.json()).toEqual({
      code: "NOT_FOUND",
      requestId: "request-2",
    });
  });
});
