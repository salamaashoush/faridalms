import type { ContentNode, PanelLayout } from "@faridalms/domain/content";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ViewStrings } from "./view";

import { ContentRenderer } from "./view";

const strings = {
  cardTurn: "Turn over",
  cardTurnBack: "Turn back",
} as ViewStrings;

const text = (words: string): ContentNode => ({
  type: "text",
  version: 1,
  text: words,
  format: 0,
});

const panel = (title: string, body: string): ContentNode => ({
  type: "panel",
  version: 1,
  children: [
    { type: "panel-title", version: 1, children: [text(title)] },
    {
      type: "panel-body",
      version: 1,
      children: [{ type: "paragraph", version: 1, children: [text(body)] }],
    },
  ],
});

function set(layout: PanelLayout, open?: boolean): ContentNode {
  return {
    type: "panels",
    version: 1,
    layout,
    ...(open === undefined ? {} : { open }),
    children: [
      panel("Leaf", "Makes food from light."),
      panel("Root", "Takes in water."),
    ],
  };
}

const drawn = (node: ContentNode) =>
  renderToStaticMarkup(
    <ContentRenderer
      document={{ root: { type: "root", version: 1, children: [node] } }}
      strings={strings}
    />,
  );

describe("sets of parts as read", () => {
  it("shows tabs one panel at a time, the first chosen", () => {
    const html = drawn(set("tabs"));
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/role="tabpanel"[^>]*hidden=""[^>]*>.*Takes in water/);
  });

  it("puts a card's back outside the button that turns it", () => {
    const html = drawn(set("cards"));
    const fronts = [
      ...html.matchAll(
        /<button[^>]*class="fe-card-turn"[^>]*>(.*?)<\/button>/g,
      ),
    ].map((found) => found[1] ?? "");
    expect(fronts).toHaveLength(2);
    expect(fronts[0]).toContain("Leaf");
    expect(fronts.join("")).not.toContain("Makes food");
    expect(html).toContain("Turn back");
  });

  it("prints every tab and both sides of every card", () => {
    for (const layout of ["tabs", "cards"] as const) {
      const html = drawn(set(layout, true));
      expect(html).not.toContain("tablist");
      expect(html).not.toContain("fe-card-turn");
      expect(html).toContain("Makes food from light.");
      expect(html).toContain("Takes in water.");
    }
  });

  it("numbers steps in an ordered list", () => {
    const html = drawn(set("steps"));
    expect(html).toMatch(/<ol class="fe-steps" data-layout="steps">/);
    expect(html.match(/class="fe-step"/g)).toHaveLength(2);
  });
});
