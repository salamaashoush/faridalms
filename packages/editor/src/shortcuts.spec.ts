import { buildEditorFromExtensions } from "@lexical/extension";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  defineExtension,
  KEY_DOWN_COMMAND,
} from "lexical";
import { describe, expect, it } from "vitest";

import { ShortcutsExtension } from "./extensions";
import { contentExtensions } from "./headless";

describe("keyboard shortcuts", () => {
  it("raises and lowers the selected letters by their key, whatever it types", () => {
    const target = buildEditorFromExtensions(
      defineExtension({
        name: "test/shortcuts",
        dependencies: [...contentExtensions, ShortcutsExtension],
      }),
    );
    const step = (change: () => void) =>
      target.update(change, { discrete: true });
    const press = (key: string, code: string) =>
      step(() => {
        target.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key, code, ctrlKey: true }),
        );
      });
    const two = () =>
      target.read("latest", () => {
        const node = $getRoot().getAllTextNodes().at(-1);
        return node
          ? {
              text: node.getTextContent(),
              superscript: node.hasFormat("superscript"),
              subscript: node.hasFormat("subscript"),
            }
          : null;
      });

    step(() => {
      const text = $createTextNode("x2");
      $getRoot().clear().append($createParagraphNode().append(text));
      text.select(1, 2);
    });
    press(".", "Period");
    expect(two()).toEqual({ text: "2", superscript: true, subscript: false });
    // An Arabic layout types another letter on the same key.
    press("ز", "Period");
    expect(two()).toEqual({ text: "x2", superscript: false, subscript: false });
    press(",", "Comma");
    expect(two()).toEqual({ text: "2", superscript: false, subscript: true });
  });
});
