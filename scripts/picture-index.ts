/**
 * Builds the open pictures' search index from its two sources:
 * ARASAAC's pictograms, whose Arabic keywords carry their vowel marks, and
 * OpenMoji's emoji. Only words and ids are kept; the pictures stay with
 * their makers until a teacher picks one, when it is copied into the school.
 *
 *   bun scripts/picture-index.ts
 *
 * Pictograms ARASAAC flags as violent or sexual are left out, as are skin
 * tone repeats and flags, which add bulk and nothing a lesson needs.
 */
import { OPENMOJI_VERSION } from "@faridalms/domain/pictures";
import { writeFile } from "node:fs/promises";

const OUT = new URL("../apps/api/src/pictures/pictures.json", import.meta.url);

interface Pictogram {
  _id: number;
  keywords: { keyword: string | null }[];
  violence?: boolean;
  sex?: boolean;
}

interface Emoji {
  hexcode: string;
  group: string;
  annotation: string;
  tags: string;
  openmoji_tags: string;
  skintone: string;
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

const words = (list: readonly (string | null)[]) =>
  [
    ...new Set(
      list.map((word) => word?.trim() ?? "").filter((word) => word !== ""),
    ),
  ].join("|");

const [english, arabic, emoji] = await Promise.all([
  json<Pictogram[]>("https://api.arasaac.org/v1/pictograms/all/en"),
  json<Pictogram[]>("https://api.arasaac.org/v1/pictograms/all/ar"),
  json<Emoji[]>(
    `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/data/openmoji.json`,
  ),
]);

const arabicOf = new Map(
  arabic.map(({ _id: id, keywords }) => [
    id,
    words(keywords.map((entry) => entry.keyword)),
  ]),
);

const arasaac = english
  .filter((item) => !item.violence && !item.sex)
  .map(({ _id: id, keywords }) => [
    id,
    words(keywords.map((entry) => entry.keyword)),
    arabicOf.get(id) ?? "",
  ])
  .filter(([, en, ar]) => en !== "" || ar !== "")
  .toSorted((a, b) => Number(a[0]) - Number(b[0]));

const openmoji = emoji
  .filter(
    (item) =>
      item.skintone === "" &&
      item.group !== "flags" &&
      item.group !== "component",
  )
  .map((item) => [
    item.hexcode,
    words([
      item.annotation,
      ...item.tags.split(","),
      ...item.openmoji_tags.split(","),
    ]),
  ])
  .toSorted((a, b) => String(a[0]).localeCompare(String(b[0])));

await writeFile(OUT, `${JSON.stringify({ arasaac, openmoji })}\n`);
console.log(
  `Picture index: ${arasaac.length} pictograms, ${openmoji.length} emoji.`,
);
