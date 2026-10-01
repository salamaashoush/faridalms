import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $getRoot } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import type { ImageNode } from "./nodes";
import { $createImageNode } from "./nodes";

describe("pictures", () => {
  it("keeps a picture marked decorative through saving and opening", () => {
    const fileId = crypto.randomUUID();
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot()
          .clear()
          .append($createImageNode(fileId, "A red kite").setDecorative(true));
      },
      { discrete: true },
    );
    const document = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(document.root.children?.[0]).toMatchObject({ decorative: true });

    const reopened = buildContentEditor();
    reopened.setEditorState(
      reopened.parseEditorState(JSON.stringify(document)),
    );
    const decorative = reopened.read(() =>
      ($getRoot().getFirstChild() as ImageNode).isDecorative(),
    );
    expect(decorative).toBe(true);
  });
});
