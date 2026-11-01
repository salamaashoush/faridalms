import type { LexicalEditor } from "lexical";

import { isSafeContentUrl } from "@faridalms/domain/content";
import { CodeExtension } from "@lexical/code";
import {
  buildEditorFromExtensions,
  HorizontalRuleExtension,
} from "@lexical/extension";
import {
  AutoLinkExtension,
  autoLinkEmailMatcher,
  autoLinkUrlMatcher,
  LinkExtension,
} from "@lexical/link";
import { CheckListExtension, ListExtension } from "@lexical/list";
import { RichTextExtension } from "@lexical/rich-text";
import { TableExtension } from "@lexical/table";
import { configExtension, defineExtension } from "lexical";

import { BlocksExtension } from "./extensions";

/**
 * The extensions that give stored content its nodes and rules. The editor
 * adds history, highlighting and shortcuts on top; a server that reads or
 * writes content without a screen uses exactly these, so both agree on what
 * a document can hold.
 */
export const contentExtensions = [
  RichTextExtension,
  ListExtension,
  CheckListExtension,
  configExtension(LinkExtension, { validateUrl: isSafeContentUrl }),
  configExtension(AutoLinkExtension, {
    matchers: [autoLinkUrlMatcher, autoLinkEmailMatcher],
  }),
  TableExtension,
  CodeExtension,
  HorizontalRuleExtension,
  BlocksExtension,
];

/**
 * An editor with no screen, for turning stored content into Yjs and back.
 * One that follows a shared document starts with nothing in it, as the
 * screen editor does, since a paragraph of its own would not be in the room.
 */
export function buildContentEditor(
  options: { empty?: boolean } = {},
): LexicalEditor {
  return buildEditorFromExtensions(
    defineExtension({
      name: "faridalms/headless",
      namespace: "faridalms-content",
      dependencies: contentExtensions,
      ...(options.empty ? { $initialEditorState: null } : {}),
    }),
  );
}
