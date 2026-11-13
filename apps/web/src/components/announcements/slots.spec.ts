import { describe, expect, it } from "vitest";

import { firstAudience } from "./slots";

const families = { scope: "families", label: () => "Families" };

describe("firstAudience", () => {
  it("sends a new announcement to the whole school where no module offers a first audience", () => {
    expect(firstAudience([])).toEqual([
      { scope: "school", classId: "", targetId: "" },
    ]);
    expect(firstAudience([families])).toEqual([
      { scope: "school", classId: "", targetId: "" },
    ]);
  });

  it("sends it to the audience a module puts first", () => {
    expect(firstAudience([{ ...families, first: true }])).toEqual([
      { scope: "families", classId: "", targetId: "" },
    ]);
  });
});
