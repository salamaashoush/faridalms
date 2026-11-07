import type { LexicalComposerContextWithEditor } from "@lexical/react/LexicalComposerContext";
import type { NodeKey } from "lexical";

import {
  createLexicalComposerContext,
  LexicalComposerContext,
} from "@lexical/react/LexicalComposerContext";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { $getRoot } from "lexical";
import { describe, expect, it, vi } from "vitest";

import type { EditorLibrary, EditorMedia } from "./context";
import type { EditorStrings } from "./strings";

import { EditorEnvironmentProvider } from "./context";
import { buildContentEditor } from "./headless";
import { $createImageNode } from "./nodes/media";
import { KeepInLibrary } from "./plugins/library";

const fileId = "0190a1b2-0000-7000-8000-0000000000c1";

const strings = {
  libraryKeep: "Keep in library",
  libraryKept: "Kept in the media library",
  libraryKeepFailed: "Could not keep it",
} as EditorStrings;

function mount(library: EditorLibrary | undefined) {
  const editor = buildContentEditor();
  let key: NodeKey = "";
  editor.update(
    () => {
      const node = $createImageNode(fileId, "A volcano erupting").setCredit({
        author: "Salama Ashoush",
        licence: "CC BY 4.0",
      });
      $getRoot().append(node);
      key = node.getKey();
    },
    { discrete: true },
  );
  const media = {
    url: (id: string) => `/files/${id}`,
    upload: () => Promise.reject(new Error("unused")),
    accept: { image: [], file: [], media: [], captions: [] },
    ...(library ? { library } : {}),
  } satisfies EditorMedia;
  const composer: LexicalComposerContextWithEditor = [
    editor,
    createLexicalComposerContext(null, null),
  ];
  const environment = { strings, locale: "en", media };
  return render(
    <LexicalComposerContext.Provider value={composer}>
      <EditorEnvironmentProvider value={environment}>
        <KeepInLibrary nodeKey={key} fileId={fileId} className="" />
      </EditorEnvironmentProvider>
    </LexicalComposerContext.Provider>,
  );
}

describe("keeping a picture in the library", () => {
  it("sends the picture with the words the document gives it, and says it is kept", async () => {
    const user = userEvent.setup();
    const keep = vi.fn(() => Promise.resolve());
    mount({ choose: () => Promise.resolve(null), keep });
    await user.click(screen.getByRole("button", { name: "Keep in library" }));
    expect(keep).toHaveBeenCalledWith(fileId, {
      alt: "A volcano erupting",
      credit: { author: "Salama Ashoush", licence: "CC BY 4.0" },
    });
    const kept = await screen.findByRole("button", {
      name: "Kept in the media library",
    });
    expect(kept.hasAttribute("disabled")).toBe(true);
  });

  it("says when it could not be kept, and may be tried again", async () => {
    const user = userEvent.setup();
    mount({
      choose: () => Promise.resolve(null),
      keep: () => Promise.reject(new Error("media.not_kept")),
    });
    await user.click(screen.getByRole("button", { name: "Keep in library" }));
    const failed = await screen.findByRole("button", {
      name: "Could not keep it",
    });
    expect(failed.hasAttribute("disabled")).toBe(false);
  });

  it("is not offered where the library cannot keep", () => {
    mount({ choose: () => Promise.resolve(null) });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
