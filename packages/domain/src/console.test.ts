import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { consoleSource, consoleText } from "./console";

describe("console text", () => {
  it("shows values the way a console prints them", () => {
    expect(consoleText("hi")).toBe("hi");
    expect(consoleText([1, "a", [], {}])).toBe('[ 1, "a", [], {} ]');
    expect(consoleText({ a: 1, b: [true, null] })).toBe(
      "{ a: 1, b: [ true, null ] }",
    );
    expect(consoleText(new Map([["k", 1]]))).toBe('Map(1) { "k" => 1 }');
    expect(consoleText(new Set())).toBe("Set(0) {}");
    expect(consoleText(function named() {})).toBe("[Function named]");
    expect(consoleText(new TypeError("bad"))).toBe("TypeError: bad");
    expect(consoleText([[[[1]]]])).toBe("[ [ [ [Array] ] ] ]");
  });

  it("runs the same from its source, where a sandbox cannot import it", () => {
    const scope: { faridaShow?: (value: unknown) => string } = {};
    runInNewContext(consoleSource, scope);
    expect(scope.faridaShow?.({ a: [1, "b"] })).toBe(
      consoleText({ a: [1, "b"] }),
    );
  });
});
