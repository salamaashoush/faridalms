import { describe, expect, it } from "vitest";

import { guardedScript, playablePage } from "./web-page";

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
