import { $createHeadingNode } from "@lexical/rich-text";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import { $createCalloutNode } from "./nodes";
import { $outline } from "./plugins/document-status";

describe("document outline", () => {
  it("lists every heading in order, those inside blocks too, and skips empty ones", () => {
    const editor = buildContentEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createHeadingNode("h1").append($createTextNode("Rivers")),
            $createParagraphNode().append($createTextNode("Water moves.")),
            $createCalloutNode("info").append(
              $createHeadingNode("h2").append($createTextNode("Remember")),
            ),
            $createHeadingNode("h3"),
            $createHeadingNode("h3").append($createTextNode("الأسئلة")),
          );
      },
      { discrete: true },
    );
    expect(
      editor
        .getEditorState()
        .read($outline)
        .map(({ level, text }) => [level, text]),
    ).toEqual([
      [1, "Rivers"],
      [2, "Remember"],
      [3, "الأسئلة"],
    ]);
  });
});
