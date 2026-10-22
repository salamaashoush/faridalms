import { describe, expect, it } from "vitest";

import { ltiPickOf } from "./lti";

describe("content a tool hands back", () => {
  it("takes a resource link as a link's fields, cut to fit", () => {
    expect(
      ltiPickOf({
        type: "ltiResourceLink",
        title: `  ${"Flood ".repeat(50)}`,
        text: "  A river in flood.  ",
        url: "https://tool.example.com/sims/flood",
        custom: { sim: "flood" },
        lineItem: { scoreMaximum: 10, tag: "sim" },
        window: { targetName: "sims" },
      }),
    ).toEqual({
      title: "Flood ".repeat(50).trim().slice(0, 200),
      text: "A river in flood.",
      url: "https://tool.example.com/sims/flood",
      custom: { sim: "flood" },
      lineItem: {
        label: "Flood ".repeat(50).trim().slice(0, 200),
        scoreMaximum: 10,
        tag: "sim",
      },
    });
  });

  it("gives nothing for other kinds of content or broken items", () => {
    expect(ltiPickOf({ type: "link", url: "https://example.com" })).toBeNull();
    expect(
      ltiPickOf({ type: "ltiResourceLink", url: "http://tool.example.com" }),
    ).toBeNull();
    expect(
      ltiPickOf({ type: "ltiResourceLink", custom: { sim: 3 } }),
    ).toBeNull();
    expect(
      ltiPickOf({ type: "ltiResourceLink", lineItem: { scoreMaximum: 0 } }),
    ).toBeNull();
    expect(ltiPickOf({ type: "ltiResourceLink" })).toEqual({ title: "" });
  });
});
