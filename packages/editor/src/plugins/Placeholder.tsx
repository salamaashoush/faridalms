import { $isListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode } from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
} from "lexical";
import { useEffect } from "react";

import { useEditorEnvironment } from "../context";
import { $isToggleTitleNode } from "../nodes";

export function PlaceholderPlugin({ empty }: { empty: string }) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  useEffect(() => {
    const marked = new Set<HTMLElement>();
    const apply = (targets: Map<HTMLElement, string>) => {
      for (const element of marked)
        if (!targets.has(element)) element.removeAttribute("data-placeholder");
      marked.clear();
      for (const [element, text] of targets) {
        if (element.getAttribute("data-placeholder") !== text)
          element.setAttribute("data-placeholder", text);
        marked.add(element);
      }
    };
    const refresh = (focused: boolean) => {
      const targets = new Map<HTMLElement, string>();
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const first = root.getFirstChild();
        if (
          root.getChildrenSize() === 1 &&
          $isParagraphNode(first) &&
          first.isEmpty()
        ) {
          const element = editor.getElementByKey(first.getKey());
          if (element) targets.set(element, empty);
          return;
        }
        const selection = $getSelection();
        if (!editor.isEditable() || !$isRangeSelection(selection)) return;
        if (!selection.isCollapsed()) return;
        const node = selection.anchor.getNode();
        const block = $isElementNode(node) ? node : node.getParent();
        if (!block || !block.isEmpty()) return;
        const text = $isHeadingNode(block)
          ? strings.headingPlaceholder
          : $isListItemNode(block)
            ? strings.listPlaceholder
            : $isToggleTitleNode(block)
              ? strings.togglePlaceholder
              : $isParagraphNode(block) && focused
                ? strings.placeholder
                : null;
        const element = text ? editor.getElementByKey(block.getKey()) : null;
        if (element && text) targets.set(element, text);
      });
      apply(targets);
    };
    refresh(false);
    return mergeRegister(
      editor.registerUpdateListener(() =>
        refresh(editor.getRootElement() === document.activeElement),
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          refresh(true);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          refresh(false);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, empty, strings]);
  return null;
}
