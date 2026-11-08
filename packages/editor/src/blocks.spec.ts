import type { LexicalEditor, LexicalNode } from "lexical";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $createCodeNode, CodeExtension } from "@lexical/code";
import {
  buildEditorFromExtensions,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { $isListNode, CheckListExtension, ListExtension } from "@lexical/list";
import { $convertToMarkdownString } from "@lexical/markdown";
import { $isHeadingNode, RichTextExtension } from "@lexical/rich-text";
import { TableExtension } from "@lexical/table";
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  BEFORE_INPUT_COMMAND,
  defineExtension,
  INSERT_PARAGRAPH_COMMAND,
} from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { EditorStrings } from "./strings";

import {
  $duplicateBlock,
  $insertBlock,
  $moveBlock,
  $turnInto,
  blockDefinitions,
  blockScope,
  filterBlocks,
  offered,
} from "./blocks";
import { BlocksExtension, sanitiseStyle } from "./extensions";
import { markdownTransformers } from "./markdown";
import {
  $createImageNode,
  $isCalloutNode,
  $isColumnsNode,
  $isGalleryNode,
  $isPanelsNode,
  $isStandardsNode,
  $isToggleNode,
  $setCodeRun,
  blockIdState,
  MediaNode,
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

  it("saves a code block students run, and forgets it when set back to reading", () => {
    const target = editor();
    const saved = (run: "run" | "predict" | null) => {
      target.update(
        () => {
          const code = $createCodeNode("py");
          code.append($createTextNode("print(1)"));
          $setCodeRun(code, run);
          $getRoot().clear().append(code);
        },
        { discrete: true },
      );
      const parsed = v.safeParse(
        contentDocumentSchema,
        target.getEditorState().toJSON(),
      );
      if (!parsed.success) throw new Error("not valid content");
      return parsed.output.root.children?.[0]?.$?.run;
    };
    expect(saved("predict")).toBe("predict");
    expect(saved(null)).toBeUndefined();
  });

  it("keeps a recording students may not skip ahead in", () => {
    const target = editor();
    target.update(
      () => {
        const recording = new MediaNode(
          "0190a1b2-0000-7000-8000-0000000000a1",
          "video/mp4",
        ).setNoSkipping(true);
        $getRoot().clear().append(recording);
      },
      { discrete: true },
    );
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(saved.success && saved.output.root.children?.[0]?.noSkipping).toBe(
      true,
    );
  });

  it("keeps a video's chapters as its teacher wrote them", () => {
    const target = editor();
    const written = "0:00 Colour bars\n0:08 The moving line";
    target.update(
      () => {
        const recording = new MediaNode(
          "0190a1b2-0000-7000-8000-0000000000a1",
          "video/mp4",
        ).setChapters(written);
        $getRoot().clear().append(recording);
      },
      { discrete: true },
    );
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(saved.success && saved.output.root.children?.[0]?.chapters).toBe(
      written,
    );
  });

  it("names standards in a block of their own, kept as they read when chosen", () => {
    const target = editor();
    const goal = {
      id: "0190a1b2-0000-7000-8000-0000000000b1",
      code: "RL.3.2",
      statement: "Recount stories and determine their central message.",
    };
    target.update(
      () => {
        $getRoot().clear().append(paragraph("Goals"));
        $getRoot().getFirstChild()?.selectEnd();
        $insertBlock("standards");
        const block = $getRoot().getChildren().find($isStandardsNode);
        block?.setTargets([goal]);
      },
      { discrete: true },
    );
    // The caret goes on below the block, as after any block without text.
    expect(types(target)).toEqual(["paragraph", "standards", "paragraph"]);
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(saved.success && saved.output.root.children?.[1]?.targets).toEqual([
      goal,
    ]);
  });

  it("goes on below a continue gate, and types below a block chosen whole", () => {
    const target = editor();
    target.update(
      () => {
        $getRoot().clear().append(paragraph("Try these."));
        $getRoot().getFirstChild()?.selectEnd();
        $insertBlock("gate");
      },
      { discrete: true },
    );
    expect(types(target)).toEqual(["paragraph", "gate", "paragraph"]);
    expect(
      target.read("latest", () => {
        const selection = $getSelection();
        return $isRangeSelection(selection)
          ? selection.anchor.getNode().getIndexWithinParent()
          : null;
      }),
    ).toBe(2);
    // With the gate itself chosen, a letter starts a line below it rather
    // than landing at the start of the document.
    target.update(
      () => {
        const gate = $getRoot().getChildAtIndex(1);
        const chosen = $createNodeSelection();
        if (gate) chosen.add(gate.getKey());
        $setSelection(chosen);
        target.dispatchCommand(
          BEFORE_INPUT_COMMAND,
          new InputEvent("beforeinput", {
            inputType: "insertText",
            data: "N",
            cancelable: true,
          }),
        );
      },
      { discrete: true },
    );
    expect(
      target.read("latest", () =>
        $getRoot()
          .getChildren()
          .map((node) => [node.getType(), node.getTextContent()]),
      ),
    ).toEqual([
      ["paragraph", "Try these."],
      ["gate", ""],
      ["paragraph", "N"],
    ]);
  });

  it("writes a set of parts as a list goes on, and leaves it from an empty last part", () => {
    const target = editor();
    const step = (change: () => void) =>
      target.update(change, { discrete: true });
    const type = (text: string) =>
      step(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(text);
      });
    const enter = () =>
      step(() => {
        target.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });
    const parts = () =>
      target.read("latest", () => {
        const set = $getRoot().getChildren().find($isPanelsNode);
        return set
          ? set
              .getChildren()
              .map((panel) => panel.getTextContent().replaceAll(/\n+/g, "|"))
          : null;
      });
    step(() => {
      $getRoot().clear().append(paragraph("Fractions"));
      $getRoot().getFirstChild()?.selectEnd();
      $insertBlock("cards");
    });
    expect(types(target)).toEqual(["paragraph", "panels", "paragraph"]);
    type("Half");
    // From the title to its body; an empty last line goes on to the empty
    // card the set started with.
    enter();
    type("One of two equal parts.");
    enter();
    enter();
    type("Quarter");
    expect(parts()).toEqual(["Half|One of two equal parts.", "Quarter|"]);
    // With no card waiting, an empty last line starts one; Enter on its
    // empty title leaves the set, the empty card gone.
    enter();
    enter();
    expect(parts()).toEqual(["Half|One of two equal parts.", "Quarter|", "|"]);
    enter();
    expect(parts()).toEqual(["Half|One of two equal parts.", "Quarter|"]);
    expect(
      target.read("latest", () => {
        const selection = $getSelection();
        return $isRangeSelection(selection)
          ? selection.anchor.getNode().getPreviousSibling()?.getType()
          : null;
      }),
    ).toBe("panels");
    // Read as steps, the same parts keep every word.
    step(() => {
      const set = $getRoot().getChildren().find($isPanelsNode);
      set?.setLayout("steps");
    });
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(saved.success && saved.output.root.children?.[1]?.layout).toBe(
      "steps",
    );
    expect(
      target.read("latest", () =>
        $convertToMarkdownString(markdownTransformers),
      ),
    ).toContain("**Half**\n\nOne of two equal parts.");
  });

  it("keeps a gallery's pictures and a picture's places as they are saved", () => {
    const target = editor();
    target.update(
      () => {
        $getRoot().clear().append(paragraph("Leaves"));
        $getRoot().getFirstChild()?.selectEnd();
        $insertBlock("gallery");
        $getRoot()
          .getChildren()
          .find($isGalleryNode)
          ?.setPictures([
            {
              fileId: "0190a1b2-0000-7000-8000-000000000041",
              alt: "An oak leaf",
              caption: "Oak",
            },
          ]);
        $getRoot().append(
          $createImageNode(
            "0190a1b2-0000-7000-8000-000000000042",
            "A leaf",
          ).setLabels([
            { id: "abcd1234ef", x: 0.5, y: 0.3, title: "Vein", text: "" },
          ]),
        );
      },
      { discrete: true },
    );
    expect(types(target)).toEqual([
      "paragraph",
      "gallery",
      "paragraph",
      "image",
    ]);
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(saved.success).toBe(true);
    const children = saved.success ? (saved.output.root.children ?? []) : [];
    expect(children[1]?.pictures?.[0]?.caption).toBe("Oak");
    expect(children[3]?.labels?.[0]?.title).toBe("Vein");
  });

  it("starts a chart as an empty table of three rows that saves", () => {
    const target = editor();
    target.update(
      () => {
        $getRoot().clear().append(paragraph("Data"));
        $getRoot().getFirstChild()?.selectEnd();
        $insertBlock("chart");
      },
      { discrete: true },
    );
    expect(types(target)).toEqual(["paragraph", "chart", "paragraph"]);
    const saved = v.safeParse(
      contentDocumentSchema,
      target.getEditorState().toJSON(),
    );
    expect(
      saved.success && saved.output.root.children?.[1]?.chart?.labels,
    ).toEqual(["", "", ""]);
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

const named = (type: string) =>
  blockDefinitions.find((block) => block.type === type);

describe("where blocks are offered", () => {
  it("offers reading aloud in a quiz, and young children's activities only in a lesson", () => {
    const quiz = blockScope({ questions: true, gates: false });
    const lesson = blockScope({ questions: true, lessonActivities: true });
    const reading = named("readingQuestion");
    const why = named("whyQuestion");
    if (!reading || !why) throw new Error("the blocks are missing");
    expect(offered(reading, quiz)).toBe(true);
    expect(offered(reading, lesson)).toBe(true);
    expect(offered(why, quiz)).toBe(false);
    expect(offered(reading, blockScope({}))).toBe(false);
  });
});

describe("finding a block by what is typed", () => {
  it("puts the block named what was typed before one it is only a keyword of", () => {
    const names: Record<string, string> = {
      questionDate: "Date",
      timeline: "Timeline",
    };
    const strings = new Proxy(
      {},
      { get: (_, key) => names[String(key)] ?? String(key) },
    ) as EditorStrings;
    const lesson = blockScope({ questions: true, lessonActivities: true });
    const found = filterBlocks("date", strings, lesson).map(
      (block) => block.type,
    );
    expect(found[0]).toBe("dateQuestion");
    expect(found).toContain("timeline");
    expect(filterBlocks("Timeline", strings, lesson)[0]?.type).toBe("timeline");
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
