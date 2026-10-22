import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonBlock } from "@faridalms/domain/learning";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { ReactNode } from "react";

import { Printer } from "lucide-react";
import { useState } from "react";

import type { ActionItem } from "~/components/system/ActionMenu";
import type { Locale } from "~/i18n/runtime";

import * as m from "~/i18n/messages";

import { PrintSheet } from "./PrintSheet";

/** A document as it may be printed, with what its reader may add to the paper. */
export interface Printable {
  /** The menu's words for this print, when a page offers more than one. */
  label?: string;
  title: string;
  /** What the paper says under the title, in the paper's language: when, where, what is due. */
  facts?: (locale: Locale) => readonly string[];
  content?: ContentDocument;
  /** A lesson as its student received it, printed in place of a document. */
  lesson?: readonly LessonBlock[];
  /** Whether this reader may print the answers, which only teachers hold. */
  answers?: boolean;
  /** The document's path in the app, for the codes on its media. */
  link?: string;
  /** The students a teacher may print a named copy for. */
  copies?: readonly string[];
  /** A form answered on paper: the children it may be answered for. */
  slip?: readonly string[];
  /** The language the document is written in, where its author set one. */
  language?: ContentLocale | null;
}

/**
 * Printing for any page that shows a document, writer's or reader's alike:
 * the menu item that opens the print sheet, and the sheet while it is open.
 */
export function usePrint(printable: Printable | null): {
  action: ActionItem | null;
  sheet: ReactNode;
} {
  const [open, setOpen] = useState(false);
  return {
    action: printable
      ? {
          label: printable.label ?? m.printAction(),
          icon: Printer,
          onSelect: () => setOpen(true),
        }
      : null,
    sheet:
      printable && open ? (
        <PrintSheet {...printable} onClose={() => setOpen(false)} />
      ) : null,
  };
}
