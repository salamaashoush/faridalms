import type { TextMatchTransformer } from "@lexical/markdown";

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
} from "lexical";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import { markdownShortcuts } from "./markdown";
import { $insertMath, $isMathNode, setArabicNotation } from "./nodes";

const dollars = markdownShortcuts.find(
  (transformer): transformer is TextMatchTransformer =>
    transformer.type === "text-match" && transformer.trigger === "$",
);

const startsRightToLeft = (words: string, school: boolean) => {
  const target = buildContentEditor();
  setArabicNotation(target, school);
  target.update(
    () => {
      const line = $createTextNode(words);
      $getRoot().clear().append($createParagraphNode().append(line));
      line.select(words.length, words.length);
      $insertMath();
    },
    { discrete: true },
  );
  return target.read("latest", () => {
    const selection = $getSelection();
    const node = $isNodeSelection(selection) ? selection.getNodes()[0] : null;
    return $isMathNode(node) ? node.isRtl() : null;
  });
};

describe("mathematics in the editor", () => {
  it("makes a formula of text between dollar signs, but not of two prices", () => {
    if (!dollars) throw new Error("no dollar shortcut");
    expect("Area is $\\pi r^2$".match(dollars.regExp)?.[2]).toBe("\\pi r^2");
    expect("then $$x^2$$".match(dollars.regExp)?.[1]).toBe("x^2");
    expect(dollars.regExp.test("It costs $5 and $")).toBe(false);
    expect(dollars.regExp.test("$$x^2$")).toBe(false);
  });

  it("turns the chosen text into a formula and chooses it to be written", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        const words = $createTextNode("so x^2 grows");
        $getRoot().clear().append($createParagraphNode().append(words));
        words.select(3, 6);
        $insertMath();
      },
      { discrete: true },
    );
    const found = target.read("latest", () => {
      const selection = $getSelection();
      const node = $isNodeSelection(selection) ? selection.getNodes()[0] : null;
      return $isMathNode(node)
        ? { latex: node.getLatex(), text: $getRoot().getTextContent() }
        : null;
    });
    expect(found).toEqual({ latex: "x^2", text: "so \\(x^2\\) grows" });
  });

  it("starts a formula in Arabic notation where the school writes it so and the text reads right to left", () => {
    expect(startsRightToLeft("احسب ", true)).toBe(true);
    expect(startsRightToLeft("Work out ", true)).toBe(false);
    expect(startsRightToLeft("احسب ", false)).toBe(false);
  });

  it("keeps a formula's LaTeX, its line and its direction through saving", () => {
    const target = buildContentEditor();
    const saved = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "paragraph",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            children: [
              { type: "math", version: 1, latex: "س+ص", direction: "rtl" },
              {
                type: "math",
                version: 1,
                latex: "\\int_0^1 x\\,dx",
                block: true,
              },
            ],
          },
        ],
      },
    };
    target.setEditorState(target.parseEditorState(JSON.stringify(saved)));
    const [paragraph] = target.getEditorState().toJSON().root.children;
    expect(paragraph).toMatchObject({
      children: saved.root.children[0]?.children,
    });
  });
});
