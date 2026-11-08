import type { LtiPicked } from "@faridalms/domain/lti";
import type { LexicalEditor, LexicalNode } from "lexical";

import { parseEmbedUrl } from "@faridalms/domain/embed";
import { $generateNodesFromDOM } from "@lexical/html";
import { $createLinkNode } from "@lexical/link";
import { $createParagraphNode, $createTextNode } from "lexical";

import type { LtiNode } from "./nodes/lti";

import { $blocksApart } from "./html-import";
import { $createLtiNode, $setLtiContent } from "./nodes/lti";
import { $createEmbedNode } from "./nodes/rich";

/** Nodes for an address a tool hands back: its video or page embedded, or a link. */
function $addressNodes(item: Extract<LtiPicked, { type: "link" }>) {
  const embed = parseEmbedUrl(item.frame ?? item.url);
  if (embed) return [$createEmbedNode(embed.provider, embed.embedId)];
  const paragraph = $createParagraphNode().append(
    $createLinkNode(item.url).append($createTextNode(item.title || item.url)),
  );
  return item.text
    ? [paragraph, $createParagraphNode().append($createTextNode(item.text))]
    : [paragraph];
}

/** Nodes for a passage of a tool's HTML, read as a paste is, so nothing in it runs. */
function $htmlNodes(editor: LexicalEditor, html: string) {
  const page = new DOMParser().parseFromString(html, "text/html");
  return $blocksApart($generateNodesFromDOM(editor, page));
}

/**
 * Places what a teacher picked in a tool: the first link to the tool fills
 * the block the pick started from, and everything else follows it in the
 * order the tool gave, each further link a block of its own. When nothing
 * picked is a link to the tool, the content takes the block's place.
 */
export function $placePicked(
  editor: LexicalEditor,
  node: LtiNode,
  items: LtiPicked[],
) {
  const toolId = node.getLink().toolId;
  let filled = false;
  let last: LexicalNode = node;
  const follow = (nodes: LexicalNode[]) => {
    for (const next of nodes) {
      last.insertAfter(next);
      last = next;
    }
  };
  for (const item of items) {
    if (item.type === "lti") {
      if (filled) {
        const added = $createLtiNode(toolId, "");
        $setLtiContent(added, { picked: item.pick });
        follow([added]);
      } else {
        $setLtiContent(node, { picked: item.pick });
        filled = true;
      }
      continue;
    }
    follow(
      item.type === "link"
        ? $addressNodes(item)
        : $htmlNodes(editor, item.html),
    );
  }
  if (!filled && last !== node) node.remove();
}
