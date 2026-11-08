import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $getRoot } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $duplicateBlock } from "./blocks";
import { buildContentEditor } from "./headless";
import { $placePicked } from "./lti-pick";
import { $createLtiNode, $isLtiNode, $setLtiContent } from "./nodes";
import { $setLtiFrame } from "./nodes/lti";

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

  it("places several picked items in order, each link a block of its own", () => {
    const toolId = crypto.randomUUID();
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot().clear().append($createLtiNode(toolId, "Library"));
      },
      { discrete: true },
    );
    target.update(
      () => {
        const node = $getRoot().getFirstChild();
        if ($isLtiNode(node))
          $placePicked(target, node, [
            { type: "lti", pick: { title: "Tides", frame: { height: 400 } } },
            {
              type: "link",
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              title: "A river",
            },
            {
              type: "html",
              html: "<p>Rivers <b>flood</b>.</p><script>x()</script>",
              title: "",
            },
            { type: "lti", pick: { title: "Floods" } },
            { type: "link", url: "https://example.com/maps", title: "Maps" },
          ]);
      },
      { discrete: true },
    );
    const document = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const blocks = document.root.children ?? [];
    expect(blocks.map((block) => block.type)).toEqual([
      "lti",
      "embed",
      "paragraph",
      "lti",
      "paragraph",
    ]);
    expect(blocks[0]?.lti).toMatchObject({
      toolId,
      title: "Tides",
      frame: { height: 400 },
    });
    expect(blocks[3]?.lti?.linkId).not.toBe(blocks[0]?.lti?.linkId);
    expect(JSON.stringify(blocks[2])).toContain("flood");
    expect(JSON.stringify(document)).not.toContain("x()");
    expect(JSON.stringify(blocks[4])).toContain("https://example.com/maps");

    // Nothing to launch picked, the content takes the link's place.
    target.update(
      () => {
        $getRoot().clear().append($createLtiNode(toolId, "Library"));
      },
      { discrete: true },
    );
    target.update(
      () => {
        const node = $getRoot().getFirstChild();
        if ($isLtiNode(node))
          $placePicked(target, node, [
            { type: "html", html: "<p>Only words.</p>", title: "" },
          ]);
      },
      { discrete: true },
    );
    expect(
      target.read(() =>
        $getRoot()
          .getChildren()
          .map((node) => node.getType()),
      ),
    ).toEqual(["paragraph"]);
  });

  it("shows a link's tool in the page, and opens it in a window again", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot()
          .clear()
          .append($createLtiNode(crypto.randomUUID(), "Simulation"));
      },
      { discrete: true },
    );
    const toggle = (framed: boolean) =>
      target.update(
        () => {
          const node = $getRoot().getFirstChild();
          if ($isLtiNode(node)) $setLtiFrame(node, framed);
        },
        { discrete: true },
      );
    const frame = () =>
      target.read(() => {
        const node = $getRoot().getFirstChild();
        return $isLtiNode(node) ? node.getLink().frame : null;
      });
    toggle(true);
    expect(frame()).toEqual({ height: 600 });
    toggle(false);
    expect(frame()).toBeUndefined();
  });
});
