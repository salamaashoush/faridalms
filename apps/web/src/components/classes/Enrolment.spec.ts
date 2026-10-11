import { describe, expect, it } from "vitest";

import { eachInTurn } from "./Enrolment";

describe("doing one thing for each in turn", () => {
  it("keeps the order given, one at a time", async () => {
    const seen: string[] = [];
    const result = await eachInTurn(["a", "b", "c"], async (item) => {
      seen.push(`start ${item}`);
      await Promise.resolve();
      seen.push(`end ${item}`);
    });
    expect(seen).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c",
    ]);
    expect(result).toEqual({ done: ["a", "b", "c"], failed: [] });
  });

  it("goes on past a failure, and says which failed and why", async () => {
    const refused = new Error("enrollment.already");
    const result = await eachInTurn(["a", "b", "c"], (item) =>
      item === "b" ? Promise.reject(refused) : Promise.resolve(),
    );
    expect(result).toEqual({
      done: ["a", "c"],
      failed: [{ item: "b", error: refused }],
    });
  });

  it("does nothing for nobody", async () => {
    expect(await eachInTurn([], () => Promise.reject(new Error("no")))).toEqual(
      { done: [], failed: [] },
    );
  });
});
