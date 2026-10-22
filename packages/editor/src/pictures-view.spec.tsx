import type { ContentNode } from "@faridalms/domain/content";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ViewStrings } from "./view";

import { ContentRenderer } from "./view";

const strings = {
  pictureLabel: (number: number) => `Label ${number}`,
  pictureLabelClose: "Close the label",
  compareBefore: "Before",
  compareAfter: "After",
  compareSlider: "Slide between before and after",
  openFile: "Open",
  picture: "Picture",
  fileRemoved: "Removed",
} as ViewStrings;

const file = (n: number) => `0190a1b2-0000-7000-8000-00000000003${n}`;

const drawn = (node: ContentNode) =>
  renderToStaticMarkup(
    <ContentRenderer
      document={{ root: { type: "root", version: 1, children: [node] } }}
      strings={strings}
      fileUrl={(fileId) => `/files/${fileId}`}
    />,
  );

const labelled = (open?: boolean): ContentNode => ({
  type: "image",
  version: 1,
  fileId: file(1),
  alt: "A plant cell",
  ...(open === undefined ? {} : { open }),
  labels: [
    {
      id: "abcd1234ef",
      x: 0.25,
      y: 0.5,
      title: "Wall",
      text: "Keeps its shape.",
    },
    { id: "abcd1234eg", x: 0.75, y: 0.5, title: "", text: "Makes food." },
  ],
});

describe("pictures as read", () => {
  it("names each place on a picture by a button that opens it", () => {
    const html = drawn(labelled());
    expect(html).toContain('aria-label="1. Wall"');
    expect(html).toContain('aria-label="2. Label 2"');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).toContain("left:25%");
    expect(html).not.toContain("Keeps its shape.");
  });

  it("lists every place on paper", () => {
    const html = drawn(labelled(true));
    expect(html).toContain('class="fe-label-list"');
    expect(html).toContain("Keeps its shape.");
    expect(html).toContain("Makes food.");
  });

  it("lays a before over an after under a slider, and side by side on paper", () => {
    const compare = (open?: boolean): ContentNode => ({
      type: "compare",
      version: 1,
      ...(open === undefined ? {} : { open }),
      pictures: [
        { fileId: file(2), alt: "The river in 1990" },
        { fileId: file(3), alt: "The river today", caption: "2024" },
      ],
    });
    const html = drawn(compare());
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="Slide between before and after"');
    expect(html).toContain(">Before<");
    expect(html).toContain(">2024<");
    const paper = drawn(compare(true));
    expect(paper).not.toContain('type="range"');
    expect(paper).toContain('class="fe-compare-printed"');
  });
});
