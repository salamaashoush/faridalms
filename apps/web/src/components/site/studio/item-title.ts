import type { Picture } from "@faridalms/domain/commons";
import type { ScalarField } from "@faridalms/domain/site-sections";

import { withoutEmphasis } from "@faridalms/domain/site-sections";

/** The fields that name an item, before any other words it holds. */
const NAMING = ["title", "name", "label", "heading"];

const MAX_WORDS = 8;

function firstWords(words: string): string {
  const all = withoutEmphasis(words).trim().split(/\s+/u).filter(Boolean);
  return all.length > MAX_WORDS
    ? `${all.slice(0, MAX_WORDS).join(" ")}…`
    : all.join(" ");
}

/**
 * What an item of a list holds, in its own words: its title, name or label,
 * else the first words it has, else its picture's description. Null when it
 * holds none of these yet.
 */
export function itemTitle(
  item: Record<string, unknown>,
  fields: Record<string, ScalarField>,
): string | null {
  const texts = Object.entries(fields)
    .filter(([, field]) => field.kind === "text")
    .map(([key]) => key)
    .toSorted((a, b) => rank(a) - rank(b));
  for (const key of texts) {
    const value = item[key];
    if (typeof value === "string") {
      const words = firstWords(value);
      if (words) return words;
    }
  }
  for (const [key, field] of Object.entries(fields)) {
    if (field.kind !== "image" && field.kind !== "media") continue;
    const picture = item[key] as Picture | undefined;
    const words = picture?.alt ? firstWords(picture.alt) : "";
    if (words) return words;
  }
  return null;
}

function rank(key: string): number {
  const at = NAMING.indexOf(key);
  return at === -1 ? NAMING.length : at;
}
