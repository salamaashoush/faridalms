import type { NodeKey } from "lexical";

import { Popover } from "@base-ui/react/popover";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode } from "@lexical/rich-text";
import { $dfs } from "@lexical/utils";
import {
  $getNodeByKey,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { ListTree, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { EditorStrings } from "../strings";

import { useEditorEnvironment } from "../context";
import { updateFromOutside } from "../outside";
import { cx, menuItemClass, shortcutLabel, ToolButton } from "../ui";

export const FOCUS_SHORTCUT = "Mod+Shift+\\";

export interface OutlineEntry {
  key: NodeKey;
  level: 1 | 2 | 3;
  text: string;
}

/** The document's headings, in order, wherever they stand. */
export function $outline(): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (const { node } of $dfs($getRoot()))
    if ($isHeadingNode(node)) {
      const text = node.getTextContent().trim();
      if (!text) continue;
      const tag = node.getTag();
      entries.push({
        key: node.getKey(),
        level: tag === "h1" ? 1 : tag === "h2" ? 2 : 3,
        text,
      });
    }
  return entries;
}

export interface DocumentStatusProps {
  words: number;
  minutes: number;
  focused: boolean;
  onFocusedChange: (focused: boolean) => void;
}

/**
 * What a writer glances at under a long document: how many words it holds
 * and how long it takes to read, an outline of its headings to jump
 * between, and a focus mode that sets the writing alone on the screen.
 */
export function DocumentStatus({
  words,
  minutes,
  focused,
  onFocusedChange,
}: DocumentStatusProps) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            event.key !== "\\" ||
            !event.shiftKey ||
            !(event.metaKey || event.ctrlKey)
          )
            return false;
          event.preventDefault();
          onFocusedChange(!focused);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, focused, onFocusedChange],
  );
  // Escape leaves focus mode once nothing else, such as an open menu, took it.
  useEffect(
    () =>
      focused
        ? editor.registerCommand(
            KEY_ESCAPE_COMMAND,
            () => {
              onFocusedChange(false);
              return true;
            },
            COMMAND_PRIORITY_LOW,
          )
        : undefined,
    [editor, focused, onFocusedChange],
  );

  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-3 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-1 text-xs text-muted-foreground backdrop-blur supports-backdrop-filter:bg-background/80">
      <span className="tabular-nums">{strings.wordCount(words)}</span>
      {minutes > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>{strings.readingTime(minutes)}</span>
        </>
      ) : null}
      <span className="ms-auto flex items-center gap-0.5">
        <Outline strings={strings} />
        <ToolButton
          label={focused ? strings.focusModeExit : strings.focusMode}
          shortcut={shortcutLabel(FOCUS_SHORTCUT)}
          active={focused}
          onClick={() => onFocusedChange(!focused)}
        >
          {focused ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
        </ToolButton>
      </span>
    </div>
  );
}

interface OutlineProps {
  strings: EditorStrings;
}

function Outline({ strings }: OutlineProps) {
  const [editor] = useLexicalComposerContext();
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const go = (key: NodeKey) => {
    updateFromOutside(editor, () => $getNodeByKey(key)?.selectEnd());
    editor
      .getElementByKey(key)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) setEntries(editor.getEditorState().read($outline));
      }}
    >
      <Popover.Trigger
        aria-label={strings.outline}
        className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-foreground/80 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
      >
        <ListTree aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="end"
          sideOffset={6}
          className="z-60"
        >
          <Popover.Popup className="max-h-[60vh] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            <Popover.Title className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {strings.outline}
            </Popover.Title>
            {entries.length ? (
              <nav aria-label={strings.outline}>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.key}>
                      <Popover.Close
                        className={cx(
                          menuItemClass,
                          "hover:bg-accent",
                          entry.level === 2 && "ps-5",
                          entry.level === 3 && "ps-8 text-muted-foreground",
                          entry.level === 1 && "font-medium",
                        )}
                        onClick={() => go(entry.key)}
                      >
                        <span className="truncate" dir="auto">
                          {entry.text}
                        </span>
                      </Popover.Close>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {strings.outlineEmpty}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
