import type { MentionKind } from "@faridalms/domain/content";
import type { ReferenceElement } from "@floating-ui/dom";
import type { MenuRenderFn } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { TextNode } from "lexical";
import type { LucideIcon } from "lucide-react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode } from "lexical";
import { BookOpen, ClipboardList, FileText, User, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MentionOption } from "../context";

import { useEditorEnvironment } from "../context";
import { $createMentionNode } from "../nodes/mention";
import { Floating, selectionReference } from "../ui";
import { TypeaheadItem } from "./typeahead";

const ICONS: Record<MentionKind, LucideIcon> = {
  person: User,
  class: Users,
  module: BookOpen,
  lesson: FileText,
  assignment: ClipboardList,
};

class Choice extends MenuOption {
  mention: MentionOption;
  constructor(mention: MentionOption) {
    super(`${mention.kind}:${mention.id}`);
    this.mention = mention;
  }
}

/**
 * Names a person or a piece of the school's teaching with @: what is typed
 * after it is looked for among those the writer may see, a moment after
 * they stop typing, and the one chosen stands in the text as a mention.
 */
export function MentionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const { mentions, strings } = useEditorEnvironment();
  const [query, setQuery] = useState<string | null>(null);
  const [found, setFound] = useState<MentionOption[]>([]);
  const [caret, setCaret] = useState<ReferenceElement | null>(null);
  const onOpen = useCallback(() => setCaret(selectionReference()), []);
  const onClose = useCallback(() => setCaret(null), []);
  useEffect(() => {
    const words = query?.trim() ?? "";
    if (!mentions || !words) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      void mentions.search(words).then((rows) => {
        if (current) setFound(rows);
      });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [mentions, query]);
  const trigger = useBasicTypeaheadTriggerMatch("@", {
    minLength: 1,
    maxLength: 40,
    allowWhitespace: true,
  });
  const options = useMemo(
    () => (query?.trim() ? found.map((mention) => new Choice(mention)) : []),
    [found, query],
  );
  const select = (option: Choice, text: TextNode | null, close: () => void) => {
    editor.update(() => {
      const { kind, id, label } = option.mention;
      const node = $createMentionNode({ kind, id, label });
      if (text) text.replace(node);
      const space = $createTextNode(" ");
      node.insertAfter(space);
      space.select(1, 1);
    });
    close();
  };
  const renderMenu: MenuRenderFn<Choice> = (
    anchor,
    { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
  ) =>
    options.length === 0 ? null : (
      <Floating
        reference={caret ?? anchor.current}
        container={anchor.current}
        keepFocus
        label={strings.mention}
        className="pointer-events-auto max-h-72 w-72 overflow-y-auto p-1"
      >
        {options.map((option, index) => {
          const Icon = ICONS[option.mention.kind];
          return (
            <TypeaheadItem
              key={option.key}
              option={option}
              index={index}
              selected={selectedIndex === index}
              onHighlight={setHighlightedIndex}
              onSelect={() => selectOptionAndCleanUp(option)}
              className="gap-2.5"
            >
              <Icon
                className="size-4 shrink-0 text-foreground/70"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-start">
                <span className="block truncate text-sm">
                  <bdi>{option.mention.label}</bdi>
                </span>
                {option.mention.detail ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    <bdi>{option.mention.detail}</bdi>
                  </span>
                ) : null}
              </span>
            </TypeaheadItem>
          );
        })}
      </Floating>
    );
  if (!mentions) return null;
  return (
    <LexicalTypeaheadMenuPlugin<Choice>
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
