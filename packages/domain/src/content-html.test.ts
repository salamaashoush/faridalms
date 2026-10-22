import { describe, expect, it } from "vitest";

import type { ContentNode } from "./content";

import { contentHtml } from "./content-html";

const words = (value: string, format = 0): ContentNode => ({
  type: "text",
  version: 1,
  text: value,
  format,
});
const block = (type: ContentNode["type"], children: ContentNode[], more = {}) =>
  ({ type, version: 1, children, ...more }) as ContentNode;
const html = (...children: ContentNode[]) =>
  contentHtml(
    { root: { type: "root", version: 1, children } },
    { fileHref: (id, name) => `files/${id}/${name}` },
  );

describe("a document as plain HTML", () => {
  it("keeps a picture's credit with it, as its licence asks", () => {
    expect(
      html({
        type: "image",
        version: 1,
        fileId: "0190a1b2-0000-7000-8000-000000000301",
        alt: "The pyramids",
        caption: "",
        credit: {
          author: "Ricardo Liberato",
          licence: "CC BY-SA 2.0",
          licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
          source:
            "https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg",
        },
      }),
    ).toContain(
      '<figcaption><small>Ricardo Liberato · CC BY-SA 2.0 · Wikimedia Commons (<a href="https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg">',
    );
  });

  it("writes words with their formats, escaped, in their direction", () => {
    expect(
      html(
        block("heading", [words("Rivers")], { tag: "h2" }),
        block("paragraph", [words("Floods "), words("<rise>", 1 | 2)], {
          direction: "ltr",
        }),
        block("paragraph", [words("النهر يفيض")], { direction: "rtl" }),
        block("paragraph", []),
      ),
    ).toBe(
      '<h2>Rivers</h2><p dir="ltr">Floods <em><strong>&lt;rise&gt;</strong></em></p><p dir="rtl">النهر يفيض</p>',
    );
  });

  it("keeps lists, tables, links and footnotes, and leaves out questions and unsafe links", () => {
    expect(
      html(
        block(
          "list",
          [
            block("listitem", [words("Rain")]),
            block("listitem", [words("Snow")]),
          ],
          { listType: "number", tag: "ol" },
        ),
        block("table", [
          block("tablerow", [
            block("tablecell", [block("paragraph", [words("Month")])], {
              headerState: 1,
            }),
          ]),
        ]),
        block("paragraph", [
          block("link", [words("read")], {
            url: "https://example.com/a?b=1&c",
          }),
          block("link", [words("run")], { url: "javascript:alert(1)" }),
          block("footnote", [words("rain")], { note: "In millimetres." }),
        ]),
        block("question", [block("question-prompt", [words("Why?")])], {
          kind: "written",
        }),
      ),
    ).toBe(
      '<ol><li>Rain</li><li>Snow</li></ol><table><tr><th><p>Month</p></th></tr></table><p><a href="https://example.com/a?b=1&amp;c">read</a>run' +
        'rain<sup><a href="#note-1" id="noted-1">1</a></sup></p><hr><ol><li id="note-1">In millimetres. <a href="#noted-1">↩</a></li></ol>',
    );
  });

  it("points pictures, files and recordings at the package's copies", () => {
    expect(
      html(
        block("image", [], {
          fileId: "f1",
          alt: "A flooded field",
          caption: "May",
        }),
        block("file", [], { fileId: "f2", name: "data.csv" }),
        block("media", [], {
          fileId: "f3",
          name: "talk.mp4",
          mime: "video/mp4",
          captionsFileId: "f4",
          captionsLang: "ar",
        }),
        block("math", [], { latex: "x<2", block: true }),
      ),
    ).toBe(
      '<figure><img src="files/f1/A flooded field" alt="A flooded field"><figcaption>May</figcaption></figure>' +
        '<p><a href="files/f2/data.csv">data.csv</a></p>' +
        '<figure><video controls src="files/f3/talk.mp4"><track kind="captions" src="files/f4/captions.vtt" srclang="ar" default></video></figure>' +
        "<p>\\[x&lt;2\\]</p>",
    );
  });

  it("writes out a bibliography of the sources its footnotes cite", () => {
    const cite = {
      type: "footnote",
      version: 1,
      note: "",
      source: {
        kind: "book",
        style: "apa",
        authors: "Ali, Sara",
        title: "Rivers of the world",
        container: "Example Press",
        date: "2021",
        volume: "",
        issue: "",
        pages: "4",
        url: "",
      },
    } satisfies ContentNode;
    expect(
      html(
        block("paragraph", [words("Deltas."), cite, words(" Again."), cite]),
        {
          type: "bibliography",
          version: 1,
        },
      ),
    ).toContain(
      "<h2>References</h2><ul><li>Ali, S. (2021). <i>Rivers of the world</i>. Example Press.</li></ul>",
    );
  });
});
