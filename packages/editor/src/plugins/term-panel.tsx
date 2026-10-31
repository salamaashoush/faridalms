import type { NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, SKIP_DOM_SELECTION_TAG } from "lexical";
import { BookX, Check, ImageOff, ImagePlus, LoaderCircle } from "lucide-react";
import { useCallback, useId, useState } from "react";

import type { TermFacts } from "../nodes/term";

import { useEditorEnvironment } from "../context";
import { $isTermNode } from "../nodes/term";
import { ToolButton } from "../ui";
import { PictureLibrary, pictureFile } from "./picture-library";

const fieldClass =
  "min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * What a term means, written in the floating bar: in words the class
 * knows, in another language where that helps, and with a picture, which
 * glosses that join a word to a picture help it stay learned.
 */
export function TermPanel({
  nodeKey,
  words,
  facts: initial,
  fresh,
  onClose,
  onRemove,
}: {
  nodeKey: NodeKey;
  words: string;
  facts: TermFacts;
  /** Just defined, so the panel opens to write what it means. */
  fresh: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, media } = useEditorEnvironment();
  const id = useId();
  const [facts, setFacts] = useState(initial);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const focusOnce = useCallback(
    (element: HTMLTextAreaElement | null) => {
      if (element && fresh) requestAnimationFrame(() => element.focus());
    },
    [fresh],
  );
  // The text keeps its caret where it was while the meaning is written here.
  const change = (patch: Partial<TermFacts>) => {
    setFacts((current) => ({ ...current, ...patch }));
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isTermNode(node)) node.setFacts(patch);
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );
  };
  const place = async (file: File, alt: string) => {
    if (!media) return;
    setBusy(true);
    setFailed(false);
    try {
      const uploaded = await media.upload(file, "image");
      change({ fileId: uploaded.fileId, alt });
      setChoosing(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const upload = () => {
    if (!media) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = media.accept.image.join(",");
    // Attached while open: Safari on iOS opens no chooser for a detached input.
    input.hidden = true;
    input.addEventListener("change", () => {
      const [file] = input.files ?? [];
      input.remove();
      if (file) void place(file, "");
    });
    input.addEventListener("cancel", () => input.remove());
    document.body.append(input);
    input.click();
  };
  const picture = facts.fileId ? media?.url(facts.fileId) : undefined;

  if (choosing && media?.pictures)
    return (
      <PictureLibrary
        onClose={() => setChoosing(false)}
        onUpload={upload}
        onPick={async (found) => {
          await place(await pictureFile(found), found.label);
        }}
      />
    );

  return (
    <div className="grid w-full gap-3">
      <p dir="auto" className="text-sm font-semibold">
        <bdi>{words}</bdi>
      </p>
      <label className="grid gap-1" htmlFor={`${id}-definition`}>
        <span className="text-xs font-medium text-muted-foreground">
          {strings.termDefinition}
        </span>
        <textarea
          id={`${id}-definition`}
          dir="auto"
          rows={2}
          ref={focusOnce}
          value={facts.definition}
          maxLength={1000}
          placeholder={strings.termDefinitionHint}
          onChange={(event) => change({ definition: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          className={`${fieldClass} min-h-16 py-1.5`}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {strings.termGloss}
        </span>
        <input
          type="text"
          dir="auto"
          value={facts.gloss ?? ""}
          maxLength={200}
          placeholder={strings.termGlossHint}
          onChange={(event) => change({ gloss: event.target.value })}
          className={`${fieldClass} h-8 max-md:h-10`}
        />
      </label>
      {media ? (
        <div className="flex items-center gap-2">
          {picture ? (
            <>
              <img
                src={picture}
                alt={facts.alt ?? ""}
                className="size-14 rounded-md border object-contain"
              />
              <ToolButton
                label={strings.termPictureRemove}
                onClick={() => change({ fileId: "", alt: "" })}
              >
                <ImageOff aria-hidden />
              </ToolButton>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => (media.pictures ? setChoosing(true) : upload())}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent disabled:opacity-50 max-md:h-10 [&_svg]:size-4"
            >
              {busy ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : (
                <ImagePlus aria-hidden />
              )}
              {strings.termPicture}
            </button>
          )}
          {failed ? (
            <span role="alert" className="text-xs text-destructive">
              {strings.uploadFailed}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-1">
        <ToolButton label={strings.termRemove} onClick={onRemove}>
          <BookX aria-hidden />
        </ToolButton>
        <ToolButton label={strings.questionDone} onClick={onClose}>
          <Check aria-hidden />
        </ToolButton>
      </div>
    </div>
  );
}
