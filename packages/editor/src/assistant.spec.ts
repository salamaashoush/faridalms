import { describe, expect, it } from "vitest";

import { blockDefinitions, blockScope, offered } from "./blocks";

const suggest = blockDefinitions.find(
  (block) => block.type === "assistantQuestions",
);

describe("questions suggested by the school's language model", () => {
  it("are offered only where the document asks questions and the host offers the model", () => {
    if (!suggest) throw new Error("no entry");
    const assistant = {};
    expect(offered(suggest, blockScope({ questions: true, assistant }))).toBe(
      true,
    );
    expect(offered(suggest, blockScope({ questions: true }))).toBe(false);
    expect(offered(suggest, blockScope({ assistant }))).toBe(false);
  });
});
