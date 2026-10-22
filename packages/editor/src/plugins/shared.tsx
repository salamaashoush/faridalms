import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LexicalEditor, LexicalNode, NodeKey } from "lexical";

import { sharable } from "@faridalms/domain/shared";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { useEffect } from "react";

import type { EditorShared } from "../context";

import { $anchorFor, serialized } from "../blocks";
import { useEditorEnvironment } from "../context";
import { $createSharedNode } from "../nodes/shared";
import { updateFromOutside } from "../outside";

export const OPEN_SHARED_COMMAND = createCommand<void>("FARIDA_OPEN_SHARED");

/** A block as a document of its own, as a shared block keeps it. */
export function $blockDocument(block: LexicalNode): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [serialized(block) as unknown as ContentNode],
    },
  };
}

/**
 * Whether a block may be kept to show in many documents: one standing at
 * the top of the document, as a shared block must, holding no question.
 */
export const $sharableBlock = (block: LexicalNode) =>
  $isRootNode(block.getParent()) && sharable($blockDocument(block));

/**
 * Keeps a block as a shared block and puts the shared block in its place,
 * so this document shows it as every other one will.
 */
export function keepShared(
  editor: LexicalEditor,
  shared: EditorShared,
  key: NodeKey,
) {
  const content = editor.getEditorState().read(() => {
    const block = $getNodeByKey(key);
    return block ? $blockDocument(block) : null;
  });
  if (!content) return;
  void shared.keep(content).then((id) => {
    if (!id) return;
    updateFromOutside(editor, () => {
      const block = $getNodeByKey(key);
      if (!block?.isAttached()) return;
      const node = $createSharedNode(id);
      block.replace(node);
      // The caret was in the words the shared block took, so it goes on below.
      $caretAfter(node);
    });
  });
}

/** Puts the caret on the line after a block, making one where there is none. */
export function $caretAfter(node: LexicalNode) {
  const next = node.getNextSibling();
  if ($isParagraphNode(next)) next.selectStart();
  else {
    const line = $createParagraphNode();
    node.insertAfter(line);
    line.selectStart();
  }
}

/** Shows a shared block chosen from those kept where the slash menu was opened. */
export function SharedPlugin() {
  const [editor] = useLexicalComposerContext();
  const { shared } = useEditorEnvironment();
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_SHARED_COMMAND,
        () => {
          if (!shared) return false;
          const anchor: NodeKey | null =
            $anchorFor("paragraph")?.getKey() ?? null;
          void shared.choose().then((id) => {
            if (!id) return;
            updateFromOutside(editor, () => {
              const node = $createSharedNode(id);
              const at = anchor ? $getNodeByKey(anchor) : null;
              if (!at?.isAttached()) $getRoot().append(node);
              else if ($isParagraphNode(at) && at.getTextContentSize() === 0)
                at.replace(node);
              else at.insertAfter(node);
              $caretAfter(node);
            });
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, shared],
  );
  return null;
}
