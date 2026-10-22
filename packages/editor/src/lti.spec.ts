import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $getRoot } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $duplicateBlock } from "./blocks";
import { buildContentEditor } from "./headless";
import { $createLtiNode, $isLtiNode, $setLtiContent } from "./nodes";

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

  it("takes what a teacher picked in the tool, and lets it go for another tool", () => {
    const toolId = crypto.randomUUID();
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot().clear().append($createLtiNode(toolId, "Simulation"));
      },
      { discrete: true },
    );
    const link = () =>
      target.read(() => {
        const node = $getRoot().getFirstChild();
        return $isLtiNode(node) ? node.getLink() : null;
      });
    const { linkId } = link() ?? {};
    const change = (to: Parameters<typeof $setLtiContent>[1]) =>
      target.update(
        () => {
          const node = $getRoot().getFirstChild();
          if ($isLtiNode(node)) $setLtiContent(node, to);
        },
        { discrete: true },
      );

    change({
      picked: {
        title: "Rivers in flood",
        url: "https://tool.example.com/sims/flood",
        custom: { sim: "flood" },
        lineItem: { label: "Rivers in flood", scoreMaximum: 10 },
      },
    });
    expect(link()).toEqual({
      linkId,
      toolId,
      title: "Rivers in flood",
      url: "https://tool.example.com/sims/flood",
      custom: { sim: "flood" },
      lineItem: { label: "Rivers in flood", scoreMaximum: 10 },
    });
    // Content with no title of its own keeps the one the teacher wrote.
    change({ picked: { title: "" } });
    expect(link()?.title).toBe("Rivers in flood");

    const other = crypto.randomUUID();
    change({ toolId: other });
    expect(link()).toEqual({ linkId, toolId: other, title: "Rivers in flood" });
  });
});
