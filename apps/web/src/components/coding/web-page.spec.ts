import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { guardedScript, playablePage } from "./web-page";

/**
 * Runs a traced script in a world of its own, as a page is, and gives back
 * the error it noted, the error that left it and what it handed out.
 */
function run(code: string) {
  const traced = guardedScript(code, false, () => "");
  const seen: { noted: unknown; thrown: unknown } = {
    noted: null,
    thrown: null,
  };
  const page: Record<string, unknown> = {};
  try {
    runInNewContext(traced, {
      __faridaErr: (error: unknown) => {
        seen.noted = error;
      },
      __faridaTry: (step: () => unknown) => {
        try {
          return step();
        } catch (error) {
          seen.noted = error;
          throw error;
        }
      },
      __faridaLoop: () => undefined,
      page,
    });
  } catch (error) {
    seen.thrown = error;
  }
  return { traced, ...seen, page };
}

// An error from another world is no instance of this one's classes.
const nameOf = (error: unknown) => (error as Error | null)?.name;

describe("a student's web page", () => {
  it("checks every loop without moving any of the student's lines", () => {
    const code =
      "while (true) x++;\nfor (const a of b) for (const c of a) n++;";
    const guarded = guardedScript(code, false);
    expect(guarded).toBe(
      "while (true) {__faridaLoop();x++;}\nfor (const a of b) {__faridaLoop();for (const c of a) {__faridaLoop();n++;}}",
    );
    expect(guarded.split("\n")).toHaveLength(2);
    expect(guardedScript("let x = ;", false)).toBe("let x = ;");
  });

  it("reports its console after the doctype, and guards only its own scripts", () => {
    const page = playablePage(
      '<!doctype html>\n<script src="lib.js"></script>\n<script type="text/template">while(1){}</script>\n<script type="module">for (;;) {}</script>',
    );
    expect(page.startsWith("<!doctype html><script>")).toBe(true);
    expect(page).toContain('<script src="lib.js"></script>');
    expect(page).toContain('<script type="text/template">while(1){}</script>');
    expect(page).toContain(
      '<script type="module">for (;;) {__faridaLoop();}</script>',
    );
    expect(page.split("\n")).toHaveLength(4);
  });
});

describe("a page that asks for a library", () => {
  it("is given the one the files host serves, and no other server's", () => {
    const page = playablePage(
      '<script src="./P5.js" defer></script>\n<script src="https://example.com/p5.js"></script>\n<script src="mine.js"></script>',
    );
    expect(page).toContain(
      '<script src="/play/lib/p5.min.js" crossorigin="anonymous" defer></script>',
    );
    expect(page).toContain('<script src="https://example.com/p5.js"></script>');
    expect(page).toContain('<script src="mine.js"></script>');
    expect(page.split("\n")).toHaveLength(3);
  });
});

describe("a page that notes its own errors", () => {
  it("notes an error the script itself runs into, and lets it go on its way", () => {
    const { noted, thrown, traced } = run("const a = 1;\nnope(a);");
    expect(nameOf(noted)).toBe("ReferenceError");
    expect(thrown).toBe(noted);
    expect(traced.split("\n")).toHaveLength(2);
  });

  it("notes an error met in a function, whatever kind of function", () => {
    for (const code of [
      "function f() { gone(); }\nf();",
      "const f = () => gone();\nf();",
      "const f = () => (gone());\nf();",
      "const f = function () { gone(); };\nf();",
      "class A { go() { gone(); } }\nnew A().go();",
      "const o = { get x() { return gone(); } };\no.x;",
      'function f() { "use strict"; gone(); }\nf();',
      "[1].forEach((n) => gone(n));",
      "for (const n of [1]) gone(n);",
      "if (true) gone(); else page.x = 1;",
      "var late = gone();",
      "let early = gone();",
    ]) {
      const { noted, thrown } = run(code);
      // The code is named beside what it noted, to say which one failed.
      expect([code, nameOf(noted)]).toEqual([code, "ReferenceError"]);
      expect([code, thrown === noted]).toEqual([code, true]);
    }
  });

  it("leaves what a script does as it was", () => {
    const { noted, thrown, page } = run(
      [
        "const twice = (n) => n * 2;",
        "const made = () => ({ a: twice(2) });",
        "function* count() { yield 1; yield 2; }",
        "class Animal { constructor(name) { this.name = name; } }",
        "class Cat extends Animal { constructor() { super('cat'); } say() { return this.name; } }",
        "let total = 0;",
        "for (const n of count()) total += n;",
        "label: for (;;) { break label; }",
        "function strict() { 'use strict'; return this === undefined; }",
        "function empty() {}",
        "page.result = [made().a, total, new Cat().say(), strict(), empty(), twice.name];",
      ].join("\n"),
    );
    expect(thrown).toBeNull();
    expect(noted).toBeNull();
    expect(page.result).toEqual([4, 3, "cat", true, undefined, "twice"]);
  });

  it("keeps a constant a constant, and what one script declares for the next", () => {
    const { noted } = run("const fixed = 1;\nfixed = 2;");
    expect(nameOf(noted)).toBe("TypeError");
    // Declarations stay where they were written, outside any wrapping.
    const traced = guardedScript(
      "const a = start();\nlet b;\nfunction f() {}",
      false,
      () => "",
    );
    expect(traced).toMatch(/^const a = /);
    expect(traced).toContain("\nlet b;\nfunction f() {}");
  });

  it("has a script that cannot be read say so, on its own line of the page", () => {
    const page = playablePage(
      "<!doctype html>\n<h1>Hi</h1>\n<script>\nlet a = 1;\nlet b = ;\n</script>\n<script>after();</script>",
      true,
    );
    expect(page).toContain('__faridaSay("SyntaxError: Unexpected token",5)');
    expect(page.split("\n")).toHaveLength(7);
    // A browser that reports its own errors is left to.
    expect(playablePage("<script>\nlet b = ;\n</script>", false)).toContain(
      "let b = ;",
    );
  });
});
