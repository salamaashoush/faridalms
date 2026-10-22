import type { ContentDocument } from "@faridalms/domain/content";
import type { LexicalEditor } from "lexical";

import { Popover } from "@base-ui/react/popover";
import { suggestedChecks } from "@faridalms/domain/suggest";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $parseSerializedNode } from "lexical";
import { ListPlus } from "lucide-react";
import { useState } from "react";

import { useEditorEnvironment } from "../context";
import { Tip } from "../ui";

const documentOf = (editor: LexicalEditor) =>
  editor.getEditorState().toJSON() as unknown as ContentDocument;

/**
 * Puts the questions suggested from the document's bold words after the
 * blocks they come from, each marked as suggested until its teacher keeps it.
 */
function $suggest(found: ReturnType<typeof suggestedChecks>) {
  const blocks = $getRoot().getChildren();
  // From the end, so each block is still where it was counted.
  for (const { after, node } of found.toReversed()) {
    const block = blocks[after];
    const question = $parseSerializedNode(node);
    if (block) block.insertAfter(question);
    else $getRoot().append(question);
  }
}

/**
 * Suggests questions from the words a teacher has set in bold: each
 * sentence holding one becomes a gap to fill with it. The teacher keeps or
 * removes each before students see the document.
 */
export function SuggestTool({
  open,
  onOpenChange: setOpen,
  anchor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the panel opens from when its own button is in the More menu. */
  anchor?: HTMLElement | null;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [found, setFound] = useState<ReturnType<typeof suggestedChecks>>([]);
  // Opening from the More menu sets `open` without going through the root.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open)
      setFound(suggestedChecks(documentOf(editor), strings.suggestPrompt));
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next)
          setFound(suggestedChecks(documentOf(editor), strings.suggestPrompt));
        setOpen(next);
      }}
    >
      {anchor === undefined ? (
        <Tip label={strings.suggestTitle}>
          <Popover.Trigger
            aria-label={strings.suggestTitle}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <ListPlus aria-hidden />
          </Popover.Trigger>
        </Tip>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          sideOffset={6}
          align={anchor === undefined ? "start" : "end"}
          anchor={anchor}
        >
          <Popover.Popup
            data-editor-prompt=""
            className="grid w-72 gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
          >
            <Popover.Title className="text-sm font-semibold">
              {strings.suggestTitle}
            </Popover.Title>
            <Popover.Description className="text-xs text-muted-foreground">
              {strings.suggestHint}
            </Popover.Description>
            <button
              type="button"
              disabled={found.length === 0}
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              onClick={() => {
                setOpen(false);
                editor.update(() => $suggest(found));
              }}
            >
              {found.length > 0
                ? strings.suggestRun(found.length)
                : strings.suggestNone}
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
