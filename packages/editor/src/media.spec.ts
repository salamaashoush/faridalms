import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $getRoot } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ImageNode } from "./nodes";

import { buildContentEditor } from "./headless";
import { $createImageNode, EmbedNode } from "./nodes";
import { creditOf } from "./picture-credit-fields";

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

  it("keeps a credit its teacher wrote, naming only who took it", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createImageNode(crypto.randomUUID(), "Our garden").setCredit(
              creditOf(null, "Salama Ashoush", "", ""),
            ),
          );
      },
      { discrete: true },
    );
    const document = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(document.root.children?.[0]?.credit).toEqual({
      author: "Salama Ashoush",
      licence: "",
    });
  });
});

describe("a picture's credit as its teacher writes it", () => {
  it("is none until it names someone or a licence", () => {
    expect(creditOf(null, " ", "", "https://example.com/a")).toBeNull();
  });

  it("links a licence it knows to its terms, and keeps a source only once it is an https link", () => {
    expect(
      creditOf(null, "", "CC BY 4.0", " https://example.com/garden "),
    ).toEqual({
      author: "",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      source: "https://example.com/garden",
    });
    expect(
      creditOf(null, "", "CC BY 4.0", "http://example.com/garden"),
    ).not.toHaveProperty("source");
  });

  it("keeps a Commons picture's terms link until its licence is renamed", () => {
    const commons = {
      author: "Ricardo Liberato",
      licence: "CC BY-SA 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      source: "https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg",
    };
    expect(
      creditOf(commons, "R. Liberato", commons.licence, commons.source),
    ).toEqual({ ...commons, author: "R. Liberato" });
    expect(
      creditOf(commons, commons.author, "My own", commons.source),
    ).not.toHaveProperty("licenceUrl");
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
