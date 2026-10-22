import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $getRoot } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ImageNode } from "./nodes";

import { buildContentEditor } from "./headless";
import { $createImageNode, EmbedNode } from "./nodes";

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

describe("YouTube and Vimeo videos", () => {
  it("keep their chapters and whether students may skip, through saving and opening", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot()
          .clear()
          .append(
            new EmbedNode("youtube", "aqz-KE-bpKQ", "The film")
              .setChapters("0:00 Opening\n1:30 The forest")
              .setNoSkipping(true),
          );
      },
      { discrete: true },
    );
    const document = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(document.root.children?.[0]).toMatchObject({
      chapters: "0:00 Opening\n1:30 The forest",
      noSkipping: true,
    });

    const reopened = buildContentEditor();
    reopened.setEditorState(
      reopened.parseEditorState(JSON.stringify(document)),
    );
    expect(
      reopened.read(() =>
        ($getRoot().getFirstChild() as EmbedNode).getRecording(),
      ),
    ).toMatchObject({ chapters: true, noSkipping: true, captions: false });
  });

  it("offer no recording to the bar for any other service", () => {
    const target = buildContentEditor();
    let recording: ReturnType<EmbedNode["getRecording"]> | undefined;
    target.update(
      () => {
        recording = new EmbedNode("desmos", "abcdefghij").getRecording();
      },
      { discrete: true },
    );
    expect(recording).toBeNull();
  });
});
