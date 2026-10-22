import type { TextSize } from "@faridalms/domain/content";
import type { BaseSelection, LexicalEditor, TextFormatType } from "lexical";

import { TEXT_SIZES } from "@faridalms/domain/content";
import { isSafeContentUrl } from "@faridalms/domain/rich-text";
import { $createLinkNode, $isLinkNode, $toggleLink } from "@lexical/link";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  createCommand,
} from "lexical";

import type { EditorColor } from "./strings";

import { updateFromOutside } from "./outside";

export const OPEN_LINK_EDITOR_COMMAND = createCommand<void>(
  "FARIDA_OPEN_LINK_EDITOR",
);

export const textColors: Record<EditorColor, string> = {
  gray: "#8a8a85",
  brown: "#9f6b53",
  orange: "#d9730d",
  yellow: "#c29316",
  green: "#3f8f5b",
  blue: "#2f7fbf",
  purple: "#8f5fbf",
  pink: "#c14c8a",
  red: "#cf4b45",
};

export const backgroundColors: Record<EditorColor, string> = {
  gray: "#8a8a8533",
  brown: "#9f6b5333",
  orange: "#d9730d33",
  yellow: "#e9b20040",
  green: "#3f8f5b33",
  blue: "#2f7fbf33",
  purple: "#8f5fbf33",
  pink: "#c14c8a33",
  red: "#cf4b4533",
};

export const textSizes = Object.keys(TEXT_SIZES) as TextSize[];

export const markFormats = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "superscript",
  "subscript",
] as const satisfies readonly TextFormatType[];
export type MarkFormat = (typeof markFormats)[number];

export function $activeFormats(): MarkFormat[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];
  return markFormats.filter((format) => selection.hasFormat(format));
}

export function $selectionColors(): { color: string; background: string } {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return { color: "", background: "" };
  return {
    color: $getSelectionStyleValueForProperty(selection, "color", ""),
    background: $getSelectionStyleValueForProperty(
      selection,
      "background-color",
      "",
    ),
  };
}

export function $applyColor(
  property: "color" | "background-color",
  value: string | null,
) {
  const selection = $getSelection();
  if ($isRangeSelection(selection))
    $patchStyleText(selection, { [property]: value });
}

/** The size of the selected text, when one of the sizes a teacher gives text. */
export function $selectionTextSize(): TextSize | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const value = $getSelectionStyleValueForProperty(selection, "font-size", "");
  return textSizes.find((size) => TEXT_SIZES[size] === value) ?? null;
}

export function $applyTextSize(size: TextSize | null) {
  const selection = $getSelection();
  if ($isRangeSelection(selection))
    $patchStyleText(selection, {
      "font-size": size ? TEXT_SIZES[size] : null,
    });
}

/**
 * The selected text back to plain words: no bold or other marks, colour,
 * highlight or size. Links stay, being where the words go rather than how
 * they look.
 */
export function $clearFormatting() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  $patchStyleText(selection, {
    color: null,
    "background-color": null,
    "font-size": null,
    "font-family": null,
  });
  for (const node of selection.extract())
    if ($isTextNode(node)) node.setFormat(0);
  selection.setFormat(0);
  selection.setStyle("");
}

export function normaliseUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const candidate =
    /^[a-z][\d+.a-z-]*:/i.test(value) || value.startsWith("mailto:")
      ? value
      : /^[\w.-]+@[\w-]+\.[\w.-]+$/.test(value)
        ? `mailto:${value}`
        : `https://${value}`;
  return isSafeContentUrl(candidate) ? candidate : null;
}

export function $currentLinkUrl(): string | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let node: ReturnType<typeof selection.anchor.getNode> | null =
    selection.anchor.getNode();
  while (node) {
    if ($isLinkNode(node)) return node.getURL();
    node = node.getParent();
  }
  return null;
}

export function applyLink(
  editor: LexicalEditor,
  saved: BaseSelection | null,
  url: string | null,
) {
  updateFromOutside(editor, () => {
    if (saved) $setSelection(saved.clone());
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (url && selection.isCollapsed() && !$currentLinkUrl()) {
      const link = $createLinkNode(url).append($createTextNode(url));
      selection.insertNodes([link]);
      return;
    }
    $toggleLink(url);
  });
}
