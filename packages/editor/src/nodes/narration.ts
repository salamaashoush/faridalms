import type { LexicalNode } from "lexical";

import {
  $getRoot,
  $getState,
  $isElementNode,
  $setState,
  createState,
} from "lexical";

import type { PartAddress } from "./question";

import { blockIdState } from "./index";
import {
  $findPart,
  $holdsPicture,
  $partAddress,
  QuestionGroupNode,
  QuestionSideNode,
} from "./question";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * A teacher's recording that reads a block or a question's part aloud, kept
 * in the node's state beside its block id so any kind of block can carry one.
 */
export const narrationState = createState("narration", {
  parse: (value) =>
    typeof value === "string" && UUID.test(value) ? value : "",
});

export function $narrationOf(node: LexicalNode): string | null {
  return $getState(node, narrationState) || null;
}

export function $setNarration(node: LexicalNode, fileId: string | null) {
  $setState(node, narrationState, fileId ?? "");
}

/** A part that may be read aloud on its own: what a picture may go on, and a group's name. */
export function $holdsNarration(node: LexicalNode): boolean {
  return (
    $holdsPicture(node) ||
    (node instanceof QuestionSideNode &&
      node.getParent() instanceof QuestionGroupNode)
  );
}

/**
 * What a recording is for, by ids that outlive the editor, so an upload that
 * finishes after the document was saved and reopened still finds its block.
 */
export type NarrationTarget =
  | { kind: "block"; id: string }
  | { kind: "part"; address: PartAddress }
  | { kind: "group"; groupId: string };

export function $narrationTarget(node: LexicalNode): NarrationTarget | null {
  const group = node.getParent();
  if (node instanceof QuestionSideNode && group instanceof QuestionGroupNode)
    return { kind: "group", groupId: group.getOptionId() };
  const address = $partAddress(node);
  if (address) return { kind: "part", address };
  const id = $getState(node, blockIdState);
  return id ? { kind: "block", id } : null;
}

export function $findNarrated(target: NarrationTarget): LexicalNode | null {
  if (target.kind === "part") return $findPart(target.address);
  const pending: LexicalNode[] = [...$getRoot().getChildren()];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (
      target.kind === "group" &&
      node instanceof QuestionGroupNode &&
      node.getOptionId() === target.groupId
    )
      return node.getFirstChild();
    if (target.kind === "block" && $getState(node, blockIdState) === target.id)
      return node;
    if ($isElementNode(node)) pending.push(...node.getChildren());
  }
  return null;
}
