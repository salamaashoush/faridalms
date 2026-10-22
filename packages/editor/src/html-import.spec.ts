import { describe, expect, it } from "vitest";

import { contentOfHtml } from "./html-import";
import { STORED_FILE } from "./nodes/stored";

const PICTURE = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const VIDEO = "33333333-3333-4333-8333-333333333333";

describe("HTML from another system as a document", () => {
  it("keeps words, lists and tables, and stands stored files apart as blocks", () => {
    const content = contentOfHtml(`
      <h2>Rivers</h2>
      <p>Rivers flood <strong>every</strong> spring. <img src="${STORED_FILE}${PICTURE}" alt="A flood"></p>
      <ul><li>Rain</li><li>Snow</li></ul>
      <table><tr><td>May</td></tr></table>
      <p><a href="${STORED_FILE}${FILE}" data-name="data.csv" data-mime="text/csv" data-bytes="12">data.csv</a></p>
      <video src="${STORED_FILE}${VIDEO}" data-mime="video/mp4"></video>
      <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
    `);
    const children = content.root.children ?? [];
    expect(children.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "image",
      "list",
      "table",
      "file",
      "media",
      "embed",
    ]);
    expect(children[2]).toMatchObject({ fileId: PICTURE, alt: "A flood" });
    expect(children[5]).toMatchObject({
      fileId: FILE,
      name: "data.csv",
      mime: "text/csv",
      bytes: 12,
    });
    expect(children[6]).toMatchObject({ fileId: VIDEO, mime: "video/mp4" });
    expect(children[7]).toMatchObject({
      provider: "youtube",
      embedId: "dQw4w9WgXcQ",
    });
  });
});
