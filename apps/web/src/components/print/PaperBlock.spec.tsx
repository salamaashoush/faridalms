import type { ContentNode } from "@faridalms/domain/content";
import type { ReactNode } from "react";

import { ContentRenderer } from "@faridalms/editor/view";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PaperFacts } from "./PaperBlock";

import { onPaper } from "./paper-blocks";
import { paperForm, typedAddress } from "./PaperBlock";

const facts: PaperFacts = {
  locale: "en",
  fileUrl: (fileId) => `/files/${fileId}`,
  online: "https://school.example.com/lessons/1",
  transcripts: false,
};
const FILE = "01a0fec5-9e12-789c-94a8-00b880271313";
const text = (value: string): ContentNode => ({
  type: "text",
  version: 1,
  text: value,
  format: 0,
});
const paragraph = (value: string): ContentNode => ({
  type: "paragraph",
  version: 1,
  children: value ? [text(value)] : [],
});
const drawn = (node: ContentNode, own: ReactNode = null, paper = facts) =>
  renderToStaticMarkup(<>{paperForm(node, own, paper)}</>);

describe("a block on paper", () => {
  it("leaves a block that prints as it reads to the reader", () => {
    expect(paperForm(paragraph("Hello"), null, facts)).toBeUndefined();
    expect(
      paperForm({ type: "code", version: 1, children: [] }, null, facts),
    ).toBeUndefined();
  });

  it("prints a link's address after its words, as someone would type it", () => {
    const link: ContentNode = {
      type: "link",
      version: 1,
      url: "https://www.example.com/stories/",
      children: [text("Read the stories")],
    };
    expect(typedAddress("https://www.example.com/stories/")).toBe(
      "example.com/stories",
    );
    expect(drawn(link, "Read the stories")).toContain("(example.com/stories)");
    // A link that already shows its address says it once.
    expect(
      paperForm(
        { ...link, children: [text("example.com/stories")] },
        null,
        facts,
      ),
    ).toBeUndefined();
    // Nobody types an address this long from paper.
    expect(
      paperForm(
        { ...link, url: `https://example.com/${"a".repeat(80)}` },
        null,
        facts,
      ),
    ).toBeUndefined();
  });

  it("gives a video its name, its chapters and a code to scan", () => {
    const html = drawn({
      type: "media",
      version: 1,
      fileId: FILE,
      name: "lesson.mp4",
      mime: "video/mp4",
      caption: "How a story is built",
      chapters: "0:00 Start\n1:30 The middle",
      transcript: "Once upon a time.",
    });
    expect(html).toContain("How a story is built");
    expect(html).toContain("Scan to watch");
    expect(html).toContain("The middle");
    expect(html).toContain("1:30");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Once upon a time.");
  });

  it("prints what a recording says only when asked to", () => {
    const sound: ContentNode = {
      type: "media",
      version: 1,
      fileId: FILE,
      name: "story.mp3",
      mime: "audio/mpeg",
      transcript: "Once upon a time.",
    };
    expect(drawn(sound)).toContain("Scan to listen");
    expect(drawn(sound)).not.toContain("Once upon a time.");
    expect(drawn(sound, null, { ...facts, transcripts: true })).toContain(
      "Once upon a time.",
    );
  });

  it("prints an embed's own address beside its code", () => {
    const html = drawn({
      type: "embed",
      version: 1,
      provider: "youtube",
      embedId: "dQw4w9WgXcQ",
      title: "A song",
    });
    expect(html).toContain("YouTube");
    expect(html).toContain("A song");
    expect(html).toContain("youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("names a file and shows a picture kept as one", () => {
    const file: ContentNode = {
      type: "file",
      version: 1,
      fileId: FILE,
      name: "worksheet.pdf",
      mime: "application/pdf",
      bytes: 1_200_000,
    };
    expect(drawn(file)).toContain("worksheet.pdf");
    expect(drawn(file)).toContain("Scan to open");
    // Without an address to open, the name stands alone.
    expect(drawn(file, null, { ...facts, online: undefined })).not.toContain(
      "<svg",
    );
    expect(drawn({ ...file, name: "map.png", mime: "image/png" })).toContain(
      `src="/files/${FILE}"`,
    );
  });

  it("asks for a prediction in writing, and sends code that only runs online", () => {
    const code: ContentNode = {
      type: "code",
      version: 1,
      language: "python",
      children: [],
    };
    expect(drawn({ ...code, $: { run: "predict" } }, <pre>x</pre>)).toContain(
      "What will this code print?",
    );
    expect(drawn({ ...code, $: { run: "run" } }, <pre>x</pre>)).toContain(
      "Scan to run this code online.",
    );
    expect(
      drawn({ ...code, language: "html", $: { run: "run" } }, <pre>x</pre>),
    ).toContain("Scan to try this page online.");
  });

  it("takes its paper form wherever it sits, inside a column as at the top", () => {
    const video: ContentNode = {
      type: "media",
      version: 1,
      fileId: FILE,
      name: "lesson.mp4",
      mime: "video/mp4",
      caption: "A video in a column",
    };
    const html = renderToStaticMarkup(
      <ContentRenderer
        document={{
          root: {
            type: "root",
            version: 1,
            children: [
              {
                type: "columns",
                version: 1,
                layout: "1:1",
                children: [
                  { type: "column", version: 1, children: [video] },
                  {
                    type: "column",
                    version: 1,
                    children: [paragraph("Beside")],
                  },
                ],
              },
            ],
          },
        }}
        strings={{} as never}
        fileUrl={facts.fileUrl}
        replace={(node, own) => paperForm(node, own, facts)}
      />,
    );
    expect(html).toContain("fe-columns");
    expect(html).toContain("Scan to watch");
    expect(html).toContain("Beside");
    expect(html).not.toContain("<video");
  });

  it("speaks the paper's language, not the reader's", () => {
    expect(
      drawn(
        { type: "media", version: 1, fileId: FILE, mime: "audio/mpeg" },
        null,
        { ...facts, locale: "ar" },
      ),
    ).toContain("تسجيل صوتي");
  });
});

const types = (nodes: ContentNode[]) =>
  onPaper({
    root: { type: "root", version: 1, children: nodes },
  }).root.children?.map((node) => node.type);
const rule: ContentNode = { type: "horizontalrule", version: 1 };
const page: ContentNode = { type: "pagebreak", version: 1 };

describe("a document on paper", () => {
  it("keeps a page break only between content", () => {
    expect(
      types([page, paragraph("One"), page, page, paragraph("Two"), page]),
    ).toEqual(["paragraph", "pagebreak", "paragraph"]);
  });

  it("drops the rules and empty lines beside a break, which would print a page of their own", () => {
    expect(
      types([
        paragraph("One"),
        rule,
        paragraph(""),
        page,
        rule,
        paragraph("Two"),
        rule,
        paragraph("Three"),
        rule,
      ]),
    ).toEqual([
      "paragraph",
      "pagebreak",
      "paragraph",
      "horizontalrule",
      "paragraph",
    ]);
  });

  it("opens every toggle, however deep", () => {
    const paper = onPaper({
      root: {
        type: "root",
        version: 1,
        children: [
          {
            type: "callout",
            version: 1,
            children: [
              {
                type: "toggle",
                version: 1,
                open: false,
                children: [
                  { type: "toggle-title", version: 1, children: [] },
                  {
                    type: "toggle-content",
                    version: 1,
                    children: [paragraph("Inside")],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(paper.root.children?.[0]?.children?.[0]?.open).toBe(true);
  });
});
