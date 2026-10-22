import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $getRoot } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $duplicateBlock } from "./blocks";
import { buildContentEditor } from "./headless";
import { $createLtiNode, $isLtiNode } from "./nodes";

describe("links to outside tools", () => {
  it("keeps a link through saving, and gives a copy of it an id of its own", () => {
    const toolId = crypto.randomUUID();
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot().clear().append($createLtiNode(toolId, "Flood simulator"));
      },
      { discrete: true },
    );
    const document = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const [saved] = document.root.children ?? [];
    expect(saved).toMatchObject({
      type: "lti",
      lti: { toolId, title: "Flood simulator" },
    });

    target.update(
      () => {
        const first = $getRoot().getFirstChild();
        if (first) $duplicateBlock(first);
      },
      { discrete: true },
    );
    const ids = target.read(() =>
      $getRoot()
        .getChildren()
        .filter($isLtiNode)
        .map((node) => node.getLink().linkId),
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(saved?.lti?.linkId);
    expect(ids[1]).not.toBe(ids[0]);
  });
});
