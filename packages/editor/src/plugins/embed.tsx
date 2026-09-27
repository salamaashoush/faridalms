import type { Embed } from "@faridalms/domain/embed";
import type { ReferenceElement } from "@floating-ui/dom";
import type { NodeKey } from "lexical";

import { parseEmbedInput } from "@faridalms/domain/embed";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { useEffect, useRef, useState } from "react";

import { $anchorFor } from "../blocks";
import { useEditorEnvironment } from "../context";
import { $createEmbedNode } from "../nodes";
import { focusText, updateFromOutside } from "../outside";
import { Floating, selectionReference } from "../ui";

export const OPEN_EMBED_COMMAND = createCommand<void>("FARIDA_OPEN_EMBED");

export function $placeEmbed(anchorKey: NodeKey | null, embed: Embed) {
  const node = $createEmbedNode(embed.provider, embed.embedId);
  const anchor = anchorKey ? $getNodeByKey(anchorKey) : null;
  if (!anchor || !anchor.isAttached()) $getRoot().append(node);
  else if ($isParagraphNode(anchor) && anchor.getTextContentSize() === 0)
    anchor.replace(node);
  else anchor.insertAfter(node);
  const next =
    node.getNextSibling() ?? node.insertAfter($createParagraphNode());
  next.selectStart();
}

export function EmbedPlugin() {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [reference, setReference] = useState<ReferenceElement | null>(null);
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const anchor = useRef<NodeKey | null>(null);

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          OPEN_EMBED_COMMAND,
          () => {
            anchor.current = $anchorFor("embed")?.getKey() ?? null;
            const element = anchor.current
              ? editor.getElementByKey(anchor.current)
              : null;
            setReference(
              element ?? selectionReference(editor.getRootElement()),
            );
            setUrl("");
            setInvalid(false);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );

  if (!reference) return null;
  const close = () => {
    setReference(null);
    focusText(editor);
  };
  const dismiss = (element: HTMLFormElement | null) => {
    if (!element) return undefined;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target))
        setReference(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  };
  return (
    <Floating
      reference={reference}
      placement="bottom-start"
      className="w-96 max-w-[calc(100vw-1rem)] p-2"
    >
      <form
        ref={dismiss}
        data-editor-prompt=""
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const embed = parseEmbedInput(url);
          if (!embed) {
            setInvalid(true);
            return;
          }
          setReference(null);
          updateFromOutside(editor, () => $placeEmbed(anchor.current, embed));
        }}
      >
        <div className="flex items-center gap-1.5">
          <input
            ref={(element) => element?.focus()}
            type="text"
            inputMode="url"
            dir="ltr"
            aria-label={strings.embedUrl}
            aria-invalid={invalid}
            placeholder={strings.embedUrl}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive"
          />
          <button
            type="submit"
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {strings.embedInsert}
          </button>
        </div>
        <p
          role={invalid ? "alert" : undefined}
          className={
            invalid
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {invalid ? strings.embedInvalid : strings.embedHint}
        </p>
      </form>
    </Floating>
  );
}
