import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";
import type { EmbedProvider } from "./embed";

import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
} from "./content";
import { embedProviders, isEmbedId } from "./embed";
import { isSiteHref, isVagueLink, MAX_BUTTON_LABEL } from "./site-links";
import { DIVIDERS, SCHEMES } from "./site-theme";

export const SITE_LOCALES = ["en", "ar"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

export const ICONS = [
  "none",
  "book",
  "graduation",
  "users",
  "globe",
  "trophy",
  "palette",
  "music",
  "flask",
  "heart",
  "leaf",
  "star",
  "calendar",
  "map",
  "phone",
  "mail",
  "shield",
  "lightbulb",
  "bus",
  "utensils",
  "award",
  "compass",
  "sparkles",
  "clock",
] as const;
export type IconId = (typeof ICONS)[number];

export const BADGES = [
  "none",
  "isi",
  "khda",
  "adek",
  "ofsted",
  "bso",
  "cis",
  "neasc",
  "ib",
  "cognia",
] as const;
export const AUDIENCES = ["student", "parent", "staff", "alumni"] as const;

type TextField = { kind: "text"; max: number; multiline?: boolean };
type RichField = { kind: "rich" };
type ImageField = { kind: "image" };
type MediaField = { kind: "media" };
type LinksField = { kind: "links"; max: number };
type HrefField = { kind: "href" };
type ChoiceField = { kind: "choice"; options: readonly [string, ...string[]] };
type NumberField = {
  kind: "number";
  min: number;
  max: number;
  initial: number;
};
type IconField = { kind: "icon" };
type DateField = { kind: "date" };
type EmbedField = { kind: "embed" };
type ItemsField = {
  kind: "items";
  max: number;
  fields: Record<string, ScalarField>;
};
type ScalarField =
  | TextField
  | RichField
  | ImageField
  | MediaField
  | LinksField
  | HrefField
  | ChoiceField
  | NumberField
  | IconField
  | DateField
  | EmbedField;
export type Field = ScalarField | ItemsField;

export interface SiteImage {
  fileId: string | null;
  alt: string;
}
export interface SiteMedia {
  kind: "image" | "video";
  fileId: string | null;
  alt: string;
  posterFileId: string | null;
  captionsFileId: string | null;
}
export interface SiteLink {
  id: string;
  label: string;
  href: string;
}
export interface SiteEmbed {
  provider: EmbedProvider;
  embedId: string;
}

type ScalarValue<F> = F extends TextField
  ? string
  : F extends RichField
    ? ContentDocument
    : F extends ImageField
      ? SiteImage
      : F extends MediaField
        ? SiteMedia
        : F extends LinksField
          ? SiteLink[]
          : F extends HrefField
            ? string
            : F extends { kind: "choice"; options: readonly (infer O)[] }
              ? O
              : F extends NumberField
                ? number
                : F extends IconField
                  ? IconId
                  : F extends DateField
                    ? string
                    : F extends EmbedField
                      ? SiteEmbed | null
                      : never;
type ValueOf<F> = F extends { kind: "items"; fields: infer G }
  ? ({ id: string } & { -readonly [K in keyof G]: ScalarValue<G[K]> })[]
  : ScalarValue<F>;
type DataOf<Fs> = { -readonly [K in keyof Fs]: ValueOf<Fs[K]> };

const t = (max: number, multiline = false): TextField => ({
  kind: "text",
  max,
  multiline,
});
const heading = t(200);
const intro = t(600, true);

export const SECTION_CATEGORIES = [
  "intro",
  "story",
  "people",
  "dynamic",
  "conversion",
] as const;
export type SectionCategory = (typeof SECTION_CATEGORIES)[number];

interface SectionSpec {
  category: SectionCategory;
  variants: readonly [string, ...string[]];
  fields: Record<string, Field>;
}

/**
 * Every section the builder offers: its layouts and its fields. The one
 * declaration drives validation, the inspector, the translation overlay, plain
 * text for search and the publish checks.
 */
export const SECTION_SPECS = {
  hero: {
    category: "intro",
    variants: ["fullbleed", "split", "inset", "type"],
    fields: {
      eyebrow: t(80),
      heading,
      text: t(500, true),
      media: { kind: "media" },
      actions: { kind: "links", max: 3 },
      height: { kind: "choice", options: ["m", "s", "l", "screen"] },
    },
  },
  pageHeader: {
    category: "intro",
    variants: ["plain", "image"],
    fields: {
      eyebrow: t(80),
      heading,
      text: t(500, true),
      media: { kind: "media" },
    },
  },
  announcement: {
    category: "intro",
    variants: ["strip", "card"],
    fields: {
      text: t(200),
      date: { kind: "date" },
      actions: { kind: "links", max: 1 },
    },
  },
  welcome: {
    category: "intro",
    variants: ["portraitStart", "portraitEnd", "letter"],
    fields: {
      heading,
      body: { kind: "rich" },
      portrait: { kind: "image" },
      name: t(100),
      role: t(100),
    },
  },
  text: {
    category: "story",
    variants: ["narrow", "columns"],
    fields: { eyebrow: t(80), heading, body: { kind: "rich" } },
  },
  imageText: {
    category: "story",
    variants: ["mediaStart", "mediaEnd", "overlap"],
    fields: {
      eyebrow: t(80),
      heading,
      body: { kind: "rich" },
      media: { kind: "media" },
      actions: { kind: "links", max: 2 },
    },
  },
  cards: {
    category: "story",
    variants: ["grid", "imageButtons", "icons", "scroller"],
    fields: {
      heading,
      text: intro,
      columns: { kind: "choice", options: ["3", "2", "4"] },
      items: {
        kind: "items",
        max: 12,
        fields: {
          title: t(120),
          text: t(300, true),
          image: { kind: "image" },
          icon: { kind: "icon" },
          href: { kind: "href" },
        },
      },
    },
  },
  divisions: {
    category: "story",
    variants: ["tall", "rows"],
    fields: {
      heading,
      text: intro,
      items: {
        kind: "items",
        max: 6,
        fields: {
          title: t(120),
          ages: t(40),
          text: t(300, true),
          image: { kind: "image" },
          href: { kind: "href" },
        },
      },
    },
  },
  stats: {
    category: "story",
    variants: ["row", "overImage", "captions"],
    fields: {
      heading,
      media: { kind: "media" },
      items: {
        kind: "items",
        max: 6,
        fields: { value: t(20), label: t(80), caption: t(200) },
      },
      source: t(200),
    },
  },
  pillars: {
    category: "story",
    variants: ["icons", "numbered", "alternating"],
    fields: {
      heading,
      text: intro,
      items: {
        kind: "items",
        max: 8,
        fields: {
          title: t(120),
          text: t(400, true),
          icon: { kind: "icon" },
          image: { kind: "image" },
        },
      },
    },
  },
  quote: {
    category: "people",
    variants: ["large", "portrait", "badge"],
    fields: {
      quote: t(600, true),
      name: t(100),
      role: t(100),
      portrait: { kind: "image" },
      badge: { kind: "choice", options: BADGES },
    },
  },
  voices: {
    category: "people",
    variants: ["grid", "carousel", "tabs"],
    fields: {
      heading,
      items: {
        kind: "items",
        max: 12,
        fields: {
          quote: t(600, true),
          name: t(100),
          role: t(100),
          audience: { kind: "choice", options: AUDIENCES },
          portrait: { kind: "image" },
        },
      },
    },
  },
  people: {
    category: "people",
    variants: ["grid", "carousel"],
    fields: {
      heading,
      text: intro,
      items: {
        kind: "items",
        max: 24,
        fields: {
          portrait: { kind: "image" },
          name: t(100),
          role: t(100),
          text: t(400, true),
        },
      },
    },
  },
  video: {
    category: "story",
    variants: ["inset", "fullbleed", "beside"],
    fields: {
      heading,
      text: intro,
      media: { kind: "media" },
      embed: { kind: "embed" },
      actions: { kind: "links", max: 1 },
    },
  },
  gallery: {
    category: "story",
    variants: ["grid", "masonry", "carousel"],
    fields: {
      heading,
      items: { kind: "items", max: 24, fields: { image: { kind: "image" } } },
    },
  },
  timeline: {
    category: "story",
    variants: ["vertical", "horizontal"],
    fields: {
      heading,
      items: {
        kind: "items",
        max: 20,
        fields: { year: t(20), title: t(120), text: t(300, true) },
      },
    },
  },
  accordion: {
    category: "story",
    variants: ["accordion", "tabs", "columns"],
    fields: {
      heading,
      text: intro,
      items: {
        kind: "items",
        max: 30,
        fields: { title: t(200), text: t(2000, true) },
      },
    },
  },
  logos: {
    category: "people",
    variants: ["row", "grid"],
    fields: {
      heading,
      items: {
        kind: "items",
        max: 16,
        fields: {
          image: { kind: "image" },
          name: t(100),
          href: { kind: "href" },
        },
      },
    },
  },
  news: {
    category: "dynamic",
    variants: ["grid", "featured", "list"],
    fields: {
      heading,
      count: { kind: "number", min: 1, max: 12, initial: 3 },
      category: t(80),
    },
  },
  events: {
    category: "dynamic",
    variants: ["list", "cards"],
    fields: {
      heading,
      items: {
        kind: "items",
        max: 12,
        fields: {
          date: { kind: "date" },
          title: t(120),
          location: t(120),
          href: { kind: "href" },
        },
      },
    },
  },
  admissions: {
    category: "conversion",
    variants: ["triad", "banner", "keyDate"],
    fields: {
      heading,
      text: intro,
      date: { kind: "date" },
      items: {
        kind: "items",
        max: 3,
        fields: {
          title: t(80),
          text: t(200, true),
          actions: { kind: "links", max: 1 },
        },
      },
    },
  },
  steps: {
    category: "conversion",
    variants: ["horizontal", "vertical"],
    fields: {
      heading,
      text: intro,
      items: {
        kind: "items",
        max: 8,
        fields: { title: t(120), text: t(300, true) },
      },
    },
  },
  fees: {
    category: "conversion",
    variants: ["table", "dates"],
    fields: {
      heading,
      text: intro,
      items: {
        kind: "items",
        max: 30,
        fields: { label: t(120), value: t(80), note: t(200) },
      },
    },
  },
  contact: {
    category: "conversion",
    variants: ["details", "map"],
    fields: { heading, text: t(500, true), mapHref: { kind: "href" } },
  },
  quickLinks: {
    category: "conversion",
    variants: ["tiles", "audience", "list"],
    fields: {
      heading,
      items: {
        kind: "items",
        max: 12,
        fields: {
          title: t(80),
          text: t(200),
          icon: { kind: "icon" },
          href: { kind: "href" },
        },
      },
    },
  },
  embed: {
    category: "story",
    variants: ["inset"],
    fields: { heading, embed: { kind: "embed" } },
  },
} as const satisfies Record<string, SectionSpec>;

export type SectionType = keyof typeof SECTION_SPECS;
export const SECTION_TYPES = Object.keys(SECTION_SPECS) as SectionType[];
type SpecOf<T extends SectionType> = (typeof SECTION_SPECS)[T];
export type SectionData<T extends SectionType> = DataOf<SpecOf<T>["fields"]>;
export type SectionVariant<T extends SectionType> =
  SpecOf<T>["variants"][number];

const id = v.pipe(v.string(), v.uuid());
const hrefSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.check(isSiteHref, "site.link"),
);

export const sectionStyleSchema = v.object({
  scheme: v.optional(v.picklist(SCHEMES), "canvas"),
  background: v.optional(
    v.object({
      kind: v.picklist(["none", "image", "video"]),
      fileId: v.nullable(id),
      posterFileId: v.nullable(id),
      overlay: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(80)),
    }),
    { kind: "none", fileId: null, posterFileId: null, overlay: 40 },
  ),
  spacing: v.optional(v.picklist(["m", "s", "l"]), "m"),
  width: v.optional(v.picklist(["contained", "wide", "full"]), "contained"),
  align: v.optional(v.picklist(["start", "center"]), "start"),
  dividerTop: v.optional(v.picklist(DIVIDERS), "none"),
  dividerBottom: v.optional(v.picklist(DIVIDERS), "none"),
  anchor: v.optional(
    v.union([
      v.literal(""),
      v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,40}$/)),
    ]),
    "",
  ),
  hideIn: v.optional(
    v.pipe(v.array(v.picklist(SITE_LOCALES)), v.maxLength(1)),
    [],
  ),
});
export type SectionStyle = v.InferOutput<typeof sectionStyleSchema>;
export const defaultStyle = (): SectionStyle => v.parse(sectionStyleSchema, {});

export type PageSection = {
  [T in SectionType]: {
    id: string;
    type: T;
    variant: SectionVariant<T>;
    style: SectionStyle;
    data: SectionData<T>;
  };
}[SectionType];
export type SectionOf<T extends SectionType> = Extract<
  PageSection,
  { type: T }
>;

function scalarSchema(field: ScalarField): v.GenericSchema {
  switch (field.kind) {
    case "text":
      return v.pipe(v.string(), v.maxLength(field.max));
    case "rich":
      return contentDocumentSchema;
    case "image":
      return v.object({
        fileId: v.nullable(id),
        alt: v.pipe(v.string(), v.maxLength(300)),
      });
    case "media":
      return v.object({
        kind: v.picklist(["image", "video"]),
        fileId: v.nullable(id),
        alt: v.pipe(v.string(), v.maxLength(300)),
        posterFileId: v.nullable(id),
        captionsFileId: v.nullable(id),
      });
    case "links":
      return v.pipe(
        v.array(
          v.object({
            id,
            label: v.pipe(v.string(), v.maxLength(60)),
            href: hrefSchema,
          }),
        ),
        v.maxLength(field.max),
      );
    case "href":
      return hrefSchema;
    case "choice":
      return v.picklist(field.options);
    case "number":
      return v.pipe(
        v.number(),
        v.integer(),
        v.minValue(field.min),
        v.maxValue(field.max),
      );
    case "icon":
      return v.picklist(ICONS);
    case "date":
      return v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]);
    case "embed":
      return v.nullable(
        v.pipe(
          v.object({
            provider: v.picklist(embedProviders),
            embedId: v.pipe(v.string(), v.maxLength(200)),
          }),
          v.check(
            (embed) => isEmbedId(embed.provider, embed.embedId),
            "site.embed",
          ),
        ),
      );
  }
  return v.never();
}

function fieldSchema(field: Field): v.GenericSchema {
  if (field.kind !== "items") return scalarSchema(field);
  return v.pipe(
    v.array(
      v.object({
        id,
        ...Object.fromEntries(
          Object.entries(field.fields).map(([key, inner]) => [
            key,
            scalarSchema(inner),
          ]),
        ),
      }),
    ),
    v.maxLength(field.max),
  );
}

const sectionSchemas = SECTION_TYPES.map((type) => {
  const spec: SectionSpec = SECTION_SPECS[type];
  return v.object({
    id,
    type: v.literal(type),
    variant: v.picklist(spec.variants),
    style: v.optional(sectionStyleSchema, defaultStyle),
    data: v.object(
      Object.fromEntries(
        Object.entries(spec.fields).map(([key, field]) => [
          key,
          fieldSchema(field),
        ]),
      ),
    ),
  });
});

export const pageSectionSchema = v.variant(
  "type",
  sectionSchemas as unknown as v.VariantOptions<"type">,
) as unknown as v.GenericSchema<unknown, PageSection>;

export function emptyBody(): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      children: [{ type: "paragraph", version: 1, children: [] }],
    },
  };
}

function initialScalar(field: ScalarField): unknown {
  switch (field.kind) {
    case "text":
    case "href":
    case "date":
      return "";
    case "rich":
      return emptyBody();
    case "image":
      return { fileId: null, alt: "" };
    case "media":
      return {
        kind: "image",
        fileId: null,
        alt: "",
        posterFileId: null,
        captionsFileId: null,
      };
    case "links":
      return [];
    case "choice":
      return field.options[0];
    case "number":
      return field.initial;
    case "icon":
      return "none";
    case "embed":
      return null;
  }
  return null;
}

const initialOf = (field: Field): unknown =>
  field.kind === "items" ? [] : initialScalar(field);

/** A new, empty section of a type in its first layout. */
export function newSection<T extends SectionType>(type: T): SectionOf<T> {
  const spec: SectionSpec = SECTION_SPECS[type];
  return {
    id: crypto.randomUUID(),
    type,
    variant: spec.variants[0],
    style: defaultStyle(),
    data: Object.fromEntries(
      Object.entries(spec.fields).map(([key, field]) => [
        key,
        initialOf(field),
      ]),
    ),
  } as unknown as SectionOf<T>;
}

/** A new, empty item for a repeating field. */
export function newItem(
  field: ItemsField,
): Record<string, unknown> & { id: string } {
  return {
    id: crypto.randomUUID(),
    ...Object.fromEntries(
      Object.entries(field.fields).map(([key, inner]) => [
        key,
        initialScalar(inner),
      ]),
    ),
  };
}

export const fieldsOf = (type: SectionType): Record<string, Field> =>
  SECTION_SPECS[type].fields;

type Loose = Record<string, unknown>;

function scalarWords(field: ScalarField, value: unknown): string[] {
  switch (field.kind) {
    case "text":
      return [value as string];
    case "rich":
      return [contentPlainText(value as ContentDocument)];
    case "image":
    case "media":
      return [(value as SiteImage).alt];
    case "links":
      return (value as SiteLink[]).map((link) => link.label);
    default:
      return [];
  }
}

function fieldWords(field: Field, value: unknown): string[] {
  if (field.kind !== "items") return scalarWords(field, value);
  return (value as Loose[]).flatMap((item) =>
    Object.entries(field.fields).flatMap(([key, inner]) =>
      scalarWords(inner, item[key]),
    ),
  );
}

/** Every piece of wording in a section, in reading order. */
export function sectionWords(section: PageSection): string[] {
  const data = section.data as Loose;
  return Object.entries(fieldsOf(section.type)).flatMap(([key, field]) =>
    fieldWords(field, data[key]),
  );
}

export const sectionWritten = (section: PageSection) =>
  sectionWords(section).some((words) => words.trim() !== "");

function scalarOverlay(
  field: ScalarField,
  original: unknown,
  translated: unknown,
): unknown {
  switch (field.kind) {
    case "text":
    case "rich":
      return translated ?? original;
    case "image":
    case "media":
      return {
        ...(original as SiteImage),
        alt: (translated as SiteImage | undefined)?.alt ?? "",
      };
    case "links": {
      const byId = new Map(
        ((translated as SiteLink[] | undefined) ?? []).map((link) => [
          link.id,
          link,
        ]),
      );
      return (original as SiteLink[]).map((link) => ({
        ...link,
        label: byId.get(link.id)?.label ?? "",
      }));
    }
    default:
      return original;
  }
}

function scalarBlank(field: ScalarField, original: unknown): unknown {
  switch (field.kind) {
    case "text":
      return "";
    case "rich":
      return emptyBody();
    case "image":
    case "media":
      return { ...(original as SiteImage), alt: "" };
    case "links":
      return (original as SiteLink[]).map((link) => ({ ...link, label: "" }));
    default:
      return original;
  }
}

function fieldOverlay(
  field: Field,
  original: unknown,
  translated: unknown,
): unknown {
  if (field.kind !== "items") return scalarOverlay(field, original, translated);
  const byId = new Map(
    ((translated as Loose[] | undefined) ?? []).map((item) => [item.id, item]),
  );
  return (original as Loose[]).map((item) => {
    const match = byId.get(item.id);
    return {
      ...item,
      ...Object.fromEntries(
        Object.entries(field.fields).map(([key, inner]) => [
          key,
          match
            ? scalarOverlay(inner, item[key], match[key])
            : scalarBlank(inner, item[key]),
        ]),
      ),
    };
  });
}

/**
 * The translation's words over the original's structure: layout, style,
 * pictures, links and counts always come from the original, so the two
 * languages can differ only in words.
 */
export function overlay(
  original: PageSection,
  translated: PageSection | undefined,
): PageSection {
  if (!translated || translated.type !== original.type) return original;
  const data = original.data as Loose;
  const theirs = translated.data as Loose;
  return {
    ...original,
    data: Object.fromEntries(
      Object.entries(fieldsOf(original.type)).map(([key, field]) => [
        key,
        fieldOverlay(field, data[key], theirs[key]),
      ]),
    ),
  } as PageSection;
}

/** A section's structure with none of its words, where a translation starts. */
export function wordless(section: PageSection): PageSection {
  const data = section.data as Loose;
  return {
    ...section,
    data: Object.fromEntries(
      Object.entries(fieldsOf(section.type)).map(([key, field]) => [
        key,
        field.kind === "items"
          ? (data[key] as Loose[]).map((item) => ({
              ...item,
              ...Object.fromEntries(
                Object.entries(field.fields).map(([inner, innerField]) => [
                  inner,
                  scalarBlank(innerField, item[inner]),
                ]),
              ),
            }))
          : scalarBlank(field, data[key]),
      ]),
    ),
  } as PageSection;
}

/**
 * Whether a translation says everything its original says: every piece of
 * wording written in the original is written in the translation too.
 */
export function sectionComplete(
  original: PageSection,
  translated: PageSection | undefined,
): boolean {
  if (!translated) return !sectionWritten(original);
  const theirs = sectionWords(overlay(original, translated));
  return sectionWords(original).every(
    (words, index) =>
      words.trim() === "" || (theirs[index] ?? "").trim() !== "",
  );
}

function scalarFiles(field: ScalarField, value: unknown): string[] {
  switch (field.kind) {
    case "image":
      return [(value as SiteImage).fileId].filter((fileId): fileId is string =>
        Boolean(fileId),
      );
    case "media": {
      const media = value as SiteMedia;
      return [media.fileId, media.posterFileId, media.captionsFileId].filter(
        (fileId): fileId is string => Boolean(fileId),
      );
    }
    case "rich":
      return contentFileIds(value as ContentDocument);
    default:
      return [];
  }
}

/** Every file a section shows: pictures, videos, posters, captions and background. */
export function sectionFileIds(section: PageSection): string[] {
  const data = section.data as Loose;
  const found = Object.entries(fieldsOf(section.type)).flatMap(
    ([key, field]) =>
      field.kind === "items"
        ? (data[key] as Loose[]).flatMap((item) =>
            Object.entries(field.fields).flatMap(([inner, innerField]) =>
              scalarFiles(innerField, item[inner]),
            ),
          )
        : scalarFiles(field, data[key]),
  );
  const background = section.style.background;
  if (background.kind !== "none")
    for (const fileId of [background.fileId, background.posterFileId])
      if (fileId) found.push(fileId);
  return [...new Set(found)];
}

export type SiteIssueCode =
  | "alt"
  | "heading"
  | "link"
  | "action"
  | "captions"
  | "label";
export interface SiteIssue {
  sectionId: string;
  code: SiteIssueCode;
}

/** What a rich body must not do on a page: compete with its title, hide pictures, say "click here". */
export function bodyIssues(body: ContentDocument): SiteIssueCode[] {
  const found = new Set<SiteIssueCode>();
  const pending: ContentNode[] = [body.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.type === "heading" && node.tag === "h1") found.add("heading");
    if (node.type === "image" && !node.alt?.trim()) found.add("alt");
    if (node.type === "link" || node.type === "autolink") {
      const label = (node.children ?? [])
        .map((child) => child.text ?? "")
        .join("");
      if (isVagueLink(label)) found.add("link");
    }
    if (node.children) pending.push(...node.children);
  }
  return [...found];
}

function scalarIssues(field: ScalarField, value: unknown): SiteIssueCode[] {
  switch (field.kind) {
    case "image": {
      const image = value as SiteImage;
      return image.fileId && !image.alt.trim() ? ["alt"] : [];
    }
    case "media": {
      const media = value as SiteMedia;
      if (!media.fileId) return [];
      if (media.kind === "video")
        return media.captionsFileId ? [] : ["captions"];
      return media.alt.trim() ? [] : ["alt"];
    }
    case "links":
      return (value as SiteLink[]).flatMap((link): SiteIssueCode[] => {
        const label = link.label.trim();
        if (!label || !link.href) return ["action"];
        if (isVagueLink(label)) return ["link"];
        return label.length > MAX_BUTTON_LABEL ? ["label"] : [];
      });
    case "rich":
      return bodyIssues(value as ContentDocument);
    default:
      return [];
  }
}

/**
 * What stops a section going out in one language: a picture without a
 * description, a video without captions, a heading competing with the page
 * title, a button without its words or target, or a link that says nothing.
 */
export function sectionIssues(section: PageSection): SiteIssueCode[] {
  const data = section.data as Loose;
  const found = new Set<SiteIssueCode>(
    Object.entries(fieldsOf(section.type)).flatMap(([key, field]) =>
      field.kind === "items"
        ? (data[key] as Loose[]).flatMap((item) =>
            Object.entries(field.fields).flatMap(([inner, innerField]) =>
              scalarIssues(innerField, item[inner]),
            ),
          )
        : scalarIssues(field, data[key]),
    ),
  );
  return [...found];
}
