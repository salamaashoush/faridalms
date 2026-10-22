import { Autocomplete } from "@base-ui/react/autocomplete";
import { Popover } from "@base-ui/react/popover";
import { Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type {
  BlockDefinition,
  BlockGroup,
  BlockScope,
  BlockType,
} from "../blocks";

import { BLOCK_GROUPS, filterBlocks } from "../blocks";
import { useEditorEnvironment } from "../context";

// A type rather than an interface, as Base UI reads a group by its keys.
type Shelf = { group: BlockGroup; items: BlockDefinition[] };

const shelvesOf = (blocks: readonly BlockDefinition[]): Shelf[] =>
  BLOCK_GROUPS.flatMap((group) => {
    const items = blocks.filter((block) => block.group === group);
    return items.length > 0 ? [{ group, items }] : [];
  });

/**
 * Every block a document can take, found by name as the slash menu finds
 * them, or by its group: sixty-odd blocks read as one list would be
 * scrolled through rather than chosen from. The arrow keys move through
 * what is shown and Enter puts the one chosen where the caret was.
 */
export function InsertTool({
  scope,
  open,
  onOpenChange,
  onPick,
  anchor,
}: {
  scope: BlockScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: BlockType) => void;
  /** Where the picker opens from when its own button is in the More menu. */
  anchor?: HTMLElement | null;
}) {
  const { strings } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const all = useMemo(
    () => shelvesOf(filterBlocks("", strings, scope)),
    [strings, scope],
  );
  const found = useMemo(
    () => shelvesOf(filterBlocks(query, strings, scope)),
    [query, strings, scope],
  );
  const names: Record<BlockGroup, string> = {
    text: strings.groupText,
    lists: strings.groupLists,
    media: strings.groupMedia,
    layout: strings.groupLayout,
    questions: strings.groupQuestions,
    words: strings.groupWords,
    arrange: strings.groupArrange,
    pictures: strings.groupPictures,
    coding: strings.groupCoding,
    reuse: strings.groupReuse,
  };

  const change = (next: boolean) => {
    onOpenChange(next);
    if (!next) setQuery("");
  };
  const pick = (type: BlockType) => {
    change(false);
    onPick(type);
  };
  // Only the list scrolls to a group, never the page behind the picker.
  const jump = (group: BlockGroup) => {
    const box = list.current;
    const label = box?.querySelector(`[data-group="${group}"]`);
    if (box && label instanceof HTMLElement)
      box.scrollTop = label.offsetTop - box.offsetTop;
    input.current?.focus();
  };

  return (
    <Popover.Root open={open} onOpenChange={change} modal={false}>
      {anchor === undefined ? (
        <Popover.Trigger className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground">
          <Plus className="size-4" aria-hidden />
          {strings.insert}
        </Popover.Trigger>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          sideOffset={6}
          align="start"
          anchor={anchor}
        >
          <Popover.Popup
            data-editor-prompt=""
            initialFocus={input}
            aria-label={strings.insert}
            className="w-96 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-none"
          >
            <Autocomplete.Root
              inline
              open
              items={all}
              filteredItems={found}
              value={query}
              onValueChange={setQuery}
              autoHighlight="always"
              itemToStringValue={(block: BlockDefinition) =>
                block.label(strings)
              }
            >
              <div className="grid gap-2">
                <Autocomplete.Input
                  ref={input}
                  dir="auto"
                  aria-label={strings.insertFind}
                  placeholder={strings.insertFind}
                  className="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-10"
                />
                {!query && found.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {found.map((shelf) => (
                      <button
                        key={shelf.group}
                        type="button"
                        onClick={() => jump(shelf.group)}
                        className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground max-md:py-1.5"
                      >
                        {names[shelf.group]}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Autocomplete.Empty className="px-2 py-3 text-sm text-muted-foreground empty:hidden">
                  {strings.insertNone}
                </Autocomplete.Empty>
                <Autocomplete.List
                  ref={list}
                  className="max-h-80 overflow-y-auto empty:hidden"
                >
                  {(shelf: Shelf) => (
                    <Autocomplete.Group key={shelf.group} items={shelf.items}>
                      <Autocomplete.GroupLabel
                        data-group={shelf.group}
                        className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                      >
                        {names[shelf.group]}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(block: BlockDefinition) => (
                          <Autocomplete.Item
                            key={block.type}
                            value={block}
                            onClick={() => pick(block.type)}
                            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 outline-none data-highlighted:bg-accent max-md:py-2"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                              <block.icon
                                className="size-4 text-foreground/70"
                                aria-hidden
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {block.label(strings)}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {block.hint(strings)}
                              </span>
                            </span>
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>
            </Autocomplete.Root>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
