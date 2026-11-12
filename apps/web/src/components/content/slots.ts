import type {
  EditorBank,
  EditorMedia,
  EditorPuzzles,
  EditorStandards,
  EditorStudio,
} from "@faridalms/editor";
import type { ComponentType, ReactNode } from "react";

import { slot } from "~/utils/extension";

/** What a module lends the editor: blocks only it can fill in. */
export interface EditorHelp {
  studio?: EditorStudio;
  puzzles?: EditorPuzzles;
  bank?: EditorBank;
  standards?: EditorStandards;
}

export interface EditorPartProps {
  /** The document teaches with its questions, as a lesson or an assignment does, rather than a form. */
  teaching: boolean;
  /** Standards blocks may name the school's standards. */
  standards: boolean;
  media: EditorMedia | undefined;
  /** Draws the editor with what this part lends it; the part adds its own dialog beside it. */
  children: (help: EditorHelp) => ReactNode;
}

/** A module's part in every editor: what it lends, and the dialog it fills a block from. */
export const editorParts = slot<ComponentType<EditorPartProps>>("editor parts");
