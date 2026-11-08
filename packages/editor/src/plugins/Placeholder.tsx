import type { ElementNode, LexicalNode, NodeKey } from "lexical";

import { $isListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
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
import {
  $isCalloutNode,
  $isPanelsNode,
  $isPanelTitleNode,
  $isQuestionNode,
  $isToggleTitleNode,
} from "../nodes";

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
    const named = (node: ElementNode): string | null => {
      if ($isHeadingNode(node))
        return (
          {
            h1: strings.heading1,
            h2: strings.heading2,
            h3: strings.heading3,
          }[node.getTag() as string] ?? strings.headingPlaceholder
        );
      if ($isListItemNode(node)) return strings.listPlaceholder;
      if ($isToggleTitleNode(node)) return strings.togglePlaceholder;
      if ($isPanelTitleNode(node)) {
        const panels = node.getParent()?.getParent();
        const layout = $isPanelsNode(panels) ? panels.getLayout() : "tabs";
        return {
          tabs: strings.tabPlaceholder,
          steps: strings.stepPlaceholder,
          timeline: strings.eventPlaceholder,
          cards: strings.cardPlaceholder,
        }[layout];
      }
      if ($isQuoteNode(node)) return strings.quote;
      const parent = node.getParent();
      if ($isCalloutNode(parent) && parent.getChildrenSize() === 1)
        return strings.callout;
      return null;
    };
    // Empty named blocks, by key. A full walk fills it once; after that an
    // update revisits only the elements it changed, and a callout's or a
    // set's own change its parts, whose names depend on it.
    const placed = new Map<NodeKey, string>();
    const $revisit = (node: LexicalNode | null) => {
      if (!$isElementNode(node)) return;
      const key = node.getKey();
      const text =
        node.isAttached() &&
        node.isEmpty() &&
        !$findMatchingParent(node, $isQuestionNode)
          ? named(node)
          : null;
      if (text) placed.set(key, text);
      else placed.delete(key);
    };
    const $walk = () => {
      placed.clear();
      const pending: LexicalNode[] = [...$getRoot().getChildren()];
      for (let node = pending.pop(); node; node = pending.pop()) {
        if (!$isElementNode(node) || $isQuestionNode(node)) continue;
        $revisit(node);
        pending.push(...node.getChildren());
      }
    };
    const $catchUp = (dirty: Map<NodeKey, boolean>) => {
      for (const key of placed.keys())
        if (!$getNodeByKey(key)?.isAttached()) placed.delete(key);
      for (const key of dirty.keys()) {
        const node = $getNodeByKey(key);
        $revisit(node);
        if ($isCalloutNode(node))
          for (const part of node.getChildren()) $revisit(part);
        if ($isPanelsNode(node))
          for (const panel of node.getChildren())
            if ($isElementNode(panel))
              for (const part of panel.getChildren()) $revisit(part);
      }
    };
    const refresh = (focused: boolean, dirty?: Map<NodeKey, boolean>) => {
      const targets = new Map<HTMLElement, string>();
      editor.getEditorState().read(() => {
        const root = $getRoot();
        if (!editor.isEditable()) placed.clear();
        else if (dirty) $catchUp(dirty);
        else $walk();
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
        if (!editor.isEditable()) return;
        // An empty heading, list item, toggle, quote or callout keeps its
        // name wherever the caret is, as it would otherwise draw nothing
        // and could not be found again; questions name their own parts.
        for (const [key, text] of placed) {
          const element = editor.getElementByKey(key);
          if (element) targets.set(element, text);
        }
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const node = selection.anchor.getNode();
        const block = $isElementNode(node) ? node : node.getParent();
        if (!focused || !$isParagraphNode(block) || !block.isEmpty()) return;
        const element = editor.getElementByKey(block.getKey());
        if (element && !targets.has(element))
          targets.set(element, strings.placeholder);
      });
      apply(targets);
    };
    refresh(false);
    return mergeRegister(
      editor.registerUpdateListener(({ dirtyElements }) =>
        refresh(
          editor.getRootElement() === document.activeElement,
          dirtyElements,
        ),
      ),
      editor.registerEditableListener(() =>
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
