import type { ReferenceElement } from "@floating-ui/dom";
import type { MenuRenderFn } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { TextNode } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
} from "lexical";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BlockDefinition, BlockGroup } from "../blocks";

import { blockScope, byGroup, filterBlocks } from "../blocks";
import { useEditorEnvironment } from "../context";
import { Floating, selectionReference } from "../ui";
import { $runBlock } from "./insert";
import { TypeaheadItem } from "./typeahead";

/**
 * Takes the typed "/query" out of the text and returns the query. Typing can
 * run ahead of the menu, which then splits off only the part of the query it
 * had seen, so the rest is found before it, back to the slash.
 */
function $takeQuery(text: TextNode | null): string {
  if (!text) return "";
  let typed = text.getTextContent();
  const previous = text.getPreviousSibling();
  if (!typed.startsWith("/") && $isTextNode(previous)) {
    const before = previous.getTextContent();
    const at = before.lastIndexOf("/");
    if (at >= 0) {
      typed = before.slice(at) + typed;
      if (at === 0) previous.remove();
      else previous.spliceText(at, before.length - at, "");
    }
  }
  text.remove();
  return typed.replace(/^\//, "");
}

class BlockOption extends MenuOption {
  block: BlockDefinition;
  constructor(block: BlockDefinition) {
    super(block.type);
    this.block = block;
  }
}

export function SlashMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const environment = useEditorEnvironment();
  const { strings } = environment;
  const scope = useMemo(() => blockScope(environment), [environment]);
  const [query, setQuery] = useState<string | null>(null);
  const [caret, setCaret] = useState<ReferenceElement | null>(null);
  const onOpen = useCallback(() => setCaret(selectionReference()), []);
  const onClose = useCallback(() => setCaret(null), []);
  // Enter can land before the menu has an option highlighted, which it then
  // ignores; the block typed for is inserted all the same. With an option
  // highlighted (marked on the root as its active descendant) the menu
  // chooses, so a choice made with the arrow keys stands.
  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (editor.getRootElement()?.hasAttribute("aria-activedescendant"))
            return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed())
            return false;
          const node = selection.anchor.getNode();
          if (!$isTextNode(node)) return false;
          const offset = selection.anchor.offset;
          const typed = /(?:^|\s)\/([^\s/]{1,32})$/.exec(
            node.getTextContent().slice(0, offset),
          )?.[1];
          if (!typed) return false;
          const [block] = filterBlocks(typed, strings, scope);
          if (!block) return false;
          event?.preventDefault();
          node.spliceText(
            offset - typed.length - 1,
            typed.length + 1,
            "",
            true,
          );
          $runBlock(editor, block.type);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, strings, scope],
  );
  const trigger = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
    maxLength: 32,
    allowWhitespace: true,
  });
  const options = useMemo(
    () =>
      (query
        ? filterBlocks(query, strings, scope)
        : byGroup(filterBlocks("", strings, scope))
      ).map((block) => new BlockOption(block)),
    [query, strings, scope],
  );
  const groups: Record<BlockGroup, string> = {
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
  const select = (
    option: BlockOption,
    text: TextNode | null,
    close: () => void,
  ) => {
    editor.update(() => {
      const typed = $takeQuery(text);
      // The option highlighted may come from a shorter query than was typed;
      // the block typed for wins when the two disagree.
      const current = filterBlocks(typed, strings, scope);
      const block = current.some((item) => item.type === option.block.type)
        ? option.block
        : current[0];
      if (block) $runBlock(editor, block.type);
    });
    close();
  };
  const renderMenu: MenuRenderFn<BlockOption> = (
    anchor,
    { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
  ) =>
    options.length === 0 ? null : (
      <SlashMenuList
        anchor={anchor.current}
        reference={caret}
        options={options}
        grouped={!query}
        groups={groups}
        selectedIndex={selectedIndex}
        onHighlight={setHighlightedIndex}
        onSelect={selectOptionAndCleanUp}
      />
    );
  return (
    <LexicalTypeaheadMenuPlugin<BlockOption>
      onQueryChange={setQuery}
      onOpen={onOpen}
      onClose={onClose}
      onSelectOption={select}
      triggerFn={trigger}
      options={options}
      anchorClassName="pointer-events-none"
      menuRenderFn={renderMenu}
    />
  );
}

function SlashMenuList({
  anchor,
  reference,
  options,
  grouped,
  groups,
  selectedIndex,
  onHighlight,
  onSelect,
}: {
  anchor: HTMLElement | null;
  reference: ReferenceElement | null;
  options: BlockOption[];
  grouped: boolean;
  groups: Record<BlockGroup, string>;
  selectedIndex: number | null;
  onHighlight: (index: number) => void;
  onSelect: (option: BlockOption) => void;
}) {
  const { strings } = useEditorEnvironment();
  useEffect(() => {
    anchor?.setAttribute("aria-label", strings.insert);
  }, [anchor, strings]);
  return (
    <Floating
      reference={reference ?? anchor}
      container={anchor}
      keepFocus
      className="pointer-events-auto max-h-80 w-72 overflow-y-auto p-1"
    >
      {options.map((option, index) => {
        const previous = options[index - 1];
        const header = grouped && previous?.block.group !== option.block.group;
        const Icon = option.block.icon;
        return (
          <div key={option.key} role="presentation">
            {header ? (
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {groups[option.block.group]}
              </p>
            ) : null}
            <TypeaheadItem
              option={option}
              index={index}
              selected={selectedIndex === index}
              onHighlight={onHighlight}
              onSelect={() => onSelect(option)}
              className="gap-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                <Icon className="size-4.5 text-foreground/70" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {option.block.label(strings)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {option.block.hint(strings)}
                </span>
              </span>
              {option.block.shortcut ? (
                <kbd
                  className="font-mono text-xs text-muted-foreground"
                  dir="ltr"
                >
                  {option.block.shortcut}
                </kbd>
              ) : null}
            </TypeaheadItem>
          </div>
        );
      })}
    </Floating>
  );
}
