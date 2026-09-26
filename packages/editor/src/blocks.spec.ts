import type { LexicalEditor, LexicalNode } from "lexical";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { CodeExtension } from "@lexical/code";
import {
  buildEditorFromExtensions,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { $isListNode, CheckListExtension, ListExtension } from "@lexical/list";
import { $convertToMarkdownString } from "@lexical/markdown";
import { $isHeadingNode, RichTextExtension } from "@lexical/rich-text";
import { TableExtension } from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $isParagraphNode,
  defineExtension,
} from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $duplicateBlock, $insertBlock, $moveBlock, $turnInto } from "./blocks";
import { BlocksExtension, sanitiseStyle } from "./extensions";
import { markdownTransformers } from "./markdown";
import {
  $isCalloutNode,
  $isColumnsNode,
  $isToggleNode,
  blockIdState,
} from "./nodes";

function editor(): LexicalEditor {
  return buildEditorFromExtensions(
    defineExtension({
      name: "test",
      dependencies: [
        RichTextExtension,
        ListExtension,
        CheckListExtension,
        TableExtension,
        CodeExtension,
        HorizontalRuleExtension,
        BlocksExtension,
      ],
    }),
  );
}

function paragraph(text: string) {
  return $createParagraphNode().append($createTextNode(text));
}

function types(target: LexicalEditor): string[] {
  return target.read("latest", () =>
    $getRoot()
      .getChildren()
      .map((node) => node.getType()),
  );
}

describe("block operations", () => {
  it("turns an empty line into the chosen block and keeps typing inside it", () => {
    const target = editor();
    target.update(
      () => {
        const line = $createParagraphNode();
        $getRoot().clear().append(line);
        line.select();
        $insertBlock("h2");
      },
      { discrete: true },
    );
    target.read("latest", () => {
      const first = $getRoot().getFirstChild();
      expect($isHeadingNode(first) && first.getTag()).toBe("h2");
    });
  });

  it("wraps text in a callout and unwraps it again without losing words", () => {
    const target = editor();
    let key = "";
    target.update(
      () => {
        const line = paragraph("Bring Salama's permission slip");
        $getRoot().clear().append(line);
        key = $turnInto(line, "callout").getKey();
      },
      { discrete: true },
    );
    expect(types(target)).toEqual(["callout"]);
    target.update(
      () => {
        const callout = $getRoot().getFirstChild();
        if (!callout || callout.getKey() !== key)
          throw new Error("callout moved");
        $turnInto(callout, "paragraph");
      },
      { discrete: true },
    );
    target.read("latest", () => {
      expect(types(target)).toEqual(["paragraph"]);
      expect($getRoot().getTextContent()).toBe(
        "Bring Salama's permission slip",
      );
    });
  });

  it("splits a list into one paragraph per item", () => {
    const target = editor();
    target.update(
      () => {
        const line = paragraph("first");
        $getRoot().clear().append(line);
        const list = $turnInto(line, "bullet");
        if (!$isListNode(list)) throw new Error("expected a list");
        $turnInto(list, "paragraph");
      },
      { discrete: true },
    );
    target.read("latest", () => {
      const children = $getRoot().getChildren();
      expect(children.every((node) => $isParagraphNode(node))).toBe(true);
      expect($getRoot().getTextContent()).toBe("first");
    });
  });

  it("places columns beside a callout rather than inside it", () => {
    const target = editor();
    target.update(
      () => {
        const line = paragraph("note");
        $getRoot().clear().append(line);
        const callout = $turnInto(line, "callout");
        if (!$isCalloutNode(callout)) throw new Error("expected a callout");
        callout.getFirstDescendant()?.selectEnd();
        $insertBlock("columns2");
      },
      { discrete: true },
    );
    target.read("latest", () => {
      const children = $getRoot().getChildren();
      expect($isCalloutNode(children[0])).toBe(true);
      expect(children.some((node) => $isColumnsNode(node))).toBe(true);
    });
  });

  it("gives every block a stable id and a duplicate a fresh one", () => {
    const target = editor();
    target.update(
      () => {
        const line = paragraph("one");
        $getRoot().clear().append(line, paragraph("two"));
        $duplicateBlock(line);
      },
      { discrete: true },
    );
    const ids = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .map((node: LexicalNode) => $getState(node, blockIdState)),
    );
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[\da-z]{8,36}$/.test(id))).toBe(true);
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(saved.success).toBe(true);
  });

  it("moves blocks up and down among their siblings", () => {
    const target = editor();
    target.update(
      () => {
        const last = paragraph("c");
        $getRoot().clear().append(paragraph("a"), paragraph("b"), last);
        $moveBlock(last, -1);
      },
      { discrete: true },
    );
    target.read("latest", () => {
      expect(
        $getRoot()
          .getChildren()
          .map((node) => node.getTextContent()),
      ).toEqual(["a", "c", "b"]);
    });
  });

  it("builds a toggle whose title keeps the original words", () => {
    const target = editor();
    target.update(
      () => {
        const line = paragraph("Uniform reminders");
        $getRoot().clear().append(line);
        $turnInto(line, "toggle");
      },
      { discrete: true },
    );
    target.read("latest", () => {
      const toggle = $getRoot().getFirstChild();
      expect($isToggleNode(toggle)).toBe(true);
      expect(toggle?.getTextContent()).toContain("Uniform reminders");
    });
  });

  it("exports callouts to Markdown as quotes instead of dropping them", () => {
    const target = editor();
    target.update(
      () => {
        const line = paragraph("Trip on Thursday");
        $getRoot().clear().append(line);
        $turnInto(line, "callout");
      },
      { discrete: true },
    );
    const markdown = target.read("latest", () =>
      $convertToMarkdownString(markdownTransformers),
    );
    expect(markdown).toBe("> Trip on Thursday");
  });
});

describe("pasted styles", () => {
  it("keeps colours and sizes the renderer allows and drops the rest", () => {
    expect(
      sanitiseStyle(
        "color: rgb(17, 24, 39); background-color: rgba(250, 204, 21, 0.5); font-weight: 700; font-size: 18px; position: fixed",
      ),
    ).toBe("color: #111827;background-color: #facc1580;font-size: 18px");
    expect(sanitiseStyle("background-color: rgba(0, 0, 0, 0)")).toBe("");
    expect(sanitiseStyle("font-family: 'Georgia', serif")).toBe(
      "font-family: Georgia",
    );
  });
});
