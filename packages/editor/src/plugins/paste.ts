import type { LexicalNode, RangeSelection } from "lexical";

import { commonsFile } from "@faridalms/domain/commons";
import {
  isEmbedCode,
  parseEmbedInput,
  parseEmbedUrl,
} from "@faridalms/domain/embed";
import { $toggleLink } from "@lexical/link";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";

import { $anchorFor } from "../blocks";
import { normaliseUrl } from "../formatting";
import { markdownTransformers } from "../markdown";
import { $createColumnNode } from "../nodes";
import { $placeEmbed } from "./embed";
import { INSERT_COMMONS_COMMAND } from "./media";

const MARKDOWN_BLOCK =
  /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|- \[[ x]\]\s|\|.+\|$)/;
const MARKDOWN_INLINE = /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`/;
const STRUCTURED_HTML = /<(p|h[1-6]|ul|ol|li|table|blockquote|pre)\b/i;

/**
 * Plain text written in Markdown, as editors, chat tools and AI assistants
 * copy it. Pages copied from a browser carry their own structure as HTML and
 * are left to the normal paste.
 */
function isMarkdown(text: string, html: string): boolean {
  if (html && STRUCTURED_HTML.test(html)) return false;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const blocks = lines.filter((line) => MARKDOWN_BLOCK.test(line)).length;
  return blocks > 0 || MARKDOWN_INLINE.test(text);
}

function $insertMarkdown(markdown: string, selection: RangeSelection) {
  const holder = $createColumnNode();
  // Converting selects the start of the detached holder; the paste goes
  // where the caret was.
  const caret = selection.clone();
  $convertFromMarkdownString(markdown, markdownTransformers, holder);
  const nodes: LexicalNode[] = holder.getChildren();
  for (const node of nodes) node.remove();
  $setSelection(caret);
  caret.insertNodes(nodes);
}

/**
 * Turns what is pasted into the block it stands for. Embed code, or an
 * embeddable link on an empty line, becomes an embed; a link pasted over
 * selected words links them; Markdown becomes headings, lists and the rest.
 * Anything else pastes as usual, links in running text becoming links.
 */
export function PastePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent) || !event.clipboardData)
            return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;
          const text = event.clipboardData.getData("text/plain");
          const html = event.clipboardData.getData("text/html");
          const trimmed = text.trim();
          if (!trimmed) return false;
          const anchor = $anchorFor("embed");
          const emptyLine =
            $isParagraphNode(anchor) && anchor.getTextContentSize() === 0;
          const single = /\s/.test(trimmed) ? null : trimmed;

          const code = isEmbedCode(trimmed) ? parseEmbedInput(trimmed) : null;
          const link = single && emptyLine ? parseEmbedUrl(single) : null;
          const embed = code ?? link;
          if (embed) {
            event.preventDefault();
            $placeEmbed(anchor?.getKey() ?? null, embed);
            return true;
          }
          // A picture from Commons comes in as a picture, its credit kept.
          if (
            single &&
            emptyLine &&
            commonsFile(single) &&
            editor.dispatchCommand(INSERT_COMMONS_COMMAND, {
              link: single,
              anchor: anchor.getKey(),
            })
          ) {
            event.preventDefault();
            return true;
          }

          if (
            single &&
            !selection.isCollapsed() &&
            /^(https?:\/\/|www\.)/i.test(single)
          ) {
            const url = normaliseUrl(single);
            if (url) {
              event.preventDefault();
              $toggleLink(url);
              return true;
            }
          }

          if (isMarkdown(trimmed, html)) {
            event.preventDefault();
            $insertMarkdown(text, selection);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );
  return null;
}
