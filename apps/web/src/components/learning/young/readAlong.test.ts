import { describe, expect, it } from "vitest";

import { spokenRange } from "./readAlong";

function stage(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("spokenRange", () => {
  it("finds the word the voice is saying across formatted text", () => {
    const root = stage(
      `<p>Other words</p><div data-read-along>The <strong>big</strong> duck swims.</div>`,
    );
    const text = "The big duck swims.";
    const range = spokenRange(root, {
      text,
      start: text.indexOf("duck"),
      length: 4,
    });
    expect(range?.toString()).toBe("duck");
  });

  it("reads Arabic words in the order they are said", () => {
    const root = stage(`<span data-read-along>البَطَّةُ تَسْبَحُ فِي الْمَاءِ</span>`);
    const text = "البَطَّةُ تَسْبَحُ فِي الْمَاءِ";
    const range = spokenRange(root, {
      text,
      start: text.indexOf("فِي"),
      length: 3,
    });
    expect(range?.toString()).toBe("فِي");
  });

  it("lights nothing when no marked text reads the same", () => {
    const root = stage(`<div data-read-along>Something else</div>`);
    expect(
      spokenRange(root, { text: "The duck", start: 4, length: 4 }),
    ).toBeNull();
  });
});
