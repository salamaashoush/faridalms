import { isSafeContentUrl } from "./rich-text";

/** A path inside the school's own site, or a safe address elsewhere. */
export function isSiteHref(value: string): boolean {
  if (value === "") return true;
  if (value.startsWith("/"))
    return /^\/[a-z0-9/_-]*(#[a-z0-9_-]+)?$/.test(value);
  return isSafeContentUrl(value);
}

const VAGUE_LINKS = new Set([
  "click here",
  "here",
  "read more",
  "more",
  "link",
  "this",
  "click",
  "اضغط هنا",
  "انقر هنا",
  "هنا",
  "المزيد",
  "اقرأ المزيد",
  "رابط",
]);

/** A link label that says nothing about where it goes. */
export const isVagueLink = (label: string) =>
  VAGUE_LINKS.has(
    label
      .trim()
      .toLowerCase()
      .replace(/[.!…:]+$/, ""),
  );

/** Buttons stay scannable under this many characters. */
export const MAX_BUTTON_LABEL = 25;
