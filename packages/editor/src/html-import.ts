import type { ContentDocument } from "@faridalms/domain/content";
import type { LexicalEditor, LexicalNode } from "lexical";

import { $generateNodesFromDOM } from "@lexical/html";
import {
  $getRoot,
  $insertNodes,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
} from "lexical";

import { buildContentEditor } from "./headless";

export { STORED_FILE } from "./nodes/stored";

/**
 * Nodes read from HTML, with each picture, file or recording standing as a
 * block of its own: HTML holds them in a paragraph, which keeps the words
 * around them.
 */
export function $blocksApart(nodes: LexicalNode[]): LexicalNode[] {
  return nodes.flatMap((node) => {
    if (!$isElementNode(node) || node.isInline()) return [node];
    const blocks = node
      .getChildren()
      .filter((child) => $isDecoratorNode(child) && !child.isInline());
    for (const block of blocks) block.remove();
    return node.getTextContent().trim() || blocks.length === 0
      ? [node, ...blocks]
      : blocks;
  });
}

/** Reads HTML into the nodes of the editor given, where its selection is. */
export function $insertHtml(editor: LexicalEditor, page: Document) {
  $insertNodes($blocksApart($generateNodesFromDOM(editor, page)));
}

/**
 * HTML from another system as a document, read as a paste is: headings,
 * lists, tables, links and embedded videos, and the pictures, files and
 * recordings it holds once they are stored with the school.
 */
export function contentOfHtml(html: string): ContentDocument {
  const editor = buildContentEditor();
  const page = new DOMParser().parseFromString(html, "text/html");
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.selectEnd();
      $insertHtml(editor, page);
      // What is left of an empty start is not part of what was read.
      const first = root.getFirstChild();
      if (
        $isParagraphNode(first) &&
        first.getTextContentSize() === 0 &&
        root.getChildrenSize() > 1
      )
        first.remove();
    },
    { discrete: true },
  );
  return editor.getEditorState().toJSON() as unknown as ContentDocument;
}
