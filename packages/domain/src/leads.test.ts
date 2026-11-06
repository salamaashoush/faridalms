import { describe, expect, it } from "vitest";

import { LEAD_STATES, leadOpen } from "./leads";

describe("leadOpen", () => {
  it("counts every stage before won or lost as still being worked", () => {
    expect(LEAD_STATES.filter(leadOpen)).toEqual([
      "new",
      "contacted",
      "demo_booked",
      "demo_done",
      "proposal",
    ]);
  });
});
