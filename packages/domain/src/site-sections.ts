import * as v from "valibot";

import type { Picture } from "./commons";
import type { ContentDocument } from "./content";
import type { EmbedProvider } from "./embed";

import { pictureEntries, pictureFocusSchema, pictureNeedsAlt } from "./commons";
import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
} from "./content";
import { contentIssues, hasFirstLevelHeading } from "./content-checks";
import { embedProviders, isEmbedId } from "./embed";
import { MAX_QUESTIONS, optionsOf, QUESTION_KINDS } from "./enquiries";
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
/** Quiet textures a section can lay over its colour. */
export const PATTERNS = ["none", "dots", "grid", "lines", "grain"] as const;
export type Pattern = (typeof PATTERNS)[number];

type TextField = {
  kind: "text";
  max: number;
  multiline?: boolean;
  /** Shown in the inspector only while a sibling field of an item has this value. */
  when?: { field: string; is: string };
};
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
export type ItemsField = {
  kind: "items";
  max: number;
  fields: Record<string, ScalarField>;
};
export type ScalarField =
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
/** Columns of freely arranged blocks, the builder's open canvas. */
type ColumnsField = { kind: "columns"; max: number };
export type Field = ScalarField | ItemsField | ColumnsField;

export interface SiteMedia extends Picture {
  kind: "image" | "video";
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
      ? Picture
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
type ValueOf<F> = F extends ColumnsField
  ? SiteColumn[]
  : F extends { kind: "items"; fields: infer G }
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
const choice = <const O extends readonly [string, ...string[]]>(
  options: O,
) => ({
  kind: "choice" as const,
  options,
});

export const MAX_BLOCKS = 12;

/**
 * The blocks a free-form section is built from, each with its own fields,
 * so a school can compose layouts no fixed section offers.
 */
export const BLOCK_SPECS = {
  heading: {
    fields: { eyebrow: t(80), text: t(200), size: choice(["l", "m", "xl"]) },
  },
  paragraph: { fields: { body: { kind: "rich" } } },
  image: {
    fields: {
      image: { kind: "image" },
      shape: choice(["theme", "square", "rounded", "circle"]),
      ratio: choice(["landscape", "square", "portrait", "wide"]),
    },
  },
  buttons: { fields: { actions: { kind: "links", max: 3 } } },
  list: {
    fields: {
      items: {
        kind: "items",
        max: 12,
        fields: { icon: { kind: "icon" }, text: t(200) },
      },
    },
  },
  stat: { fields: { value: t(20), label: t(80) } },
  quote: { fields: { quote: t(600, true), name: t(100), role: t(100) } },
  feature: {
    fields: { icon: { kind: "icon" }, title: t(120), text: t(300, true) },
  },
  video: { fields: { media: { kind: "media" }, embed: { kind: "embed" } } },
  spacer: { fields: { size: choice(["m", "s", "l"]) } },
  divider: { fields: { style: choice(["line", "dots", "ornament"]) } },
} as const satisfies Record<
  string,
  { fields: Record<string, ScalarField | ItemsField> }
>;
export type BlockType = keyof typeof BLOCK_SPECS;
export const BLOCK_TYPES = Object.keys(BLOCK_SPECS) as BlockType[];
export type SiteBlock = {
  [T in BlockType]: {
    id: string;
    type: T;
    data: DataOf<(typeof BLOCK_SPECS)[T]["fields"]>;
  };
}[BlockType];
export type BlockOf<T extends BlockType> = Extract<SiteBlock, { type: T }>;
export interface SiteColumn {
  id: string;
  blocks: SiteBlock[];
}

export const SECTION_CATEGORIES = [
  "intro",
  "story",
  "people",
  "dynamic",
  "conversion",
  "system",
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
    variants: ["fullbleed", "split", "inset", "type", "collage", "statement"],
    fields: {
      eyebrow: t(80),
      heading,
      text: t(500, true),
      media: { kind: "media" },
      more: {
        kind: "items",
        max: 2,
        fields: { image: { kind: "image" } },
      },
      actions: { kind: "links", max: 3 },
      height: { kind: "choice", options: ["m", "s", "l", "screen"] },
    },
  },
  slides: {
    category: "intro",
    variants: ["fullbleed", "split"],
    fields: {
      height: choice(["l", "m", "screen"]),
      interval: choice(["7", "10", "off"]),
      items: {
        kind: "items",
        max: 6,
        fields: {
          image: { kind: "image" },
          eyebrow: t(80),
          heading,
          text: t(400, true),
          actions: { kind: "links", max: 2 },
        },
      },
    },
  },
  pageHeader: {
    category: "intro",
    variants: ["plain", "image", "banner"],
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
  blocks: {
    category: "story",
    variants: ["columns"],
    fields: {
      eyebrow: t(80),
      heading,
      text: intro,
      layout: choice(["1-1", "2-1", "1-2", "1-1-1", "1-1-1-1", "1"]),
      valign: choice(["start", "center"]),
      columns: { kind: "columns", max: 4 },
    },
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
    variants: ["row", "grid", "marquee"],
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
      /** The school calendar's public events, or a list typed here. */
      source: choice(["calendar", "typed"]),
      count: { kind: "number", min: 1, max: 12, initial: 4 },
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
  form: {
    category: "conversion",
    variants: ["split", "stacked", "card"],
    fields: {
      eyebrow: t(80),
      heading,
      text: intro,
      purpose: choice(["enquiry", "visit", "general"]),
      email: choice(["require", "ask", "hide"]),
      phone: choice(["ask", "require", "hide"]),
      child: choice(["hide", "ask"]),
      grade: choice(["ask", "hide"]),
      message: choice(["ask", "hide"]),
      questions: {
        kind: "items",
        max: MAX_QUESTIONS,
        fields: {
          label: t(120),
          hint: t(200),
          answer: choice(QUESTION_KINDS),
          required: choice(["optional", "required"]),
          options: {
            kind: "text",
            max: 1000,
            multiline: true,
            when: { field: "answer", is: "choice" },
          },
        },
      },
      submit: t(25),
      thanks: t(300, true),
      media: { kind: "media" },
    },
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
  /**
   * The portal's sign-in form among the page's own sections: the school
   * writes its words and picks its layout, and the platform draws the form.
   */
  signIn: {
    category: "system",
    variants: ["split", "stacked"],
    fields: { eyebrow: t(80), heading, text: intro },
  },
  /** The family registration form, on the portal page a family registers on to apply. */
  register: {
    category: "system",
    variants: ["split", "stacked"],
    fields: { eyebrow: t(80), heading, text: intro },
  },
  /** The application itself, on the portal page a signed-in family applies on. */
  apply: {
    category: "system",
    variants: ["stacked", "split"],
    fields: { eyebrow: t(80), heading, text: intro },
  },
} as const satisfies Record<string, SectionSpec>;

export type SectionType = keyof typeof SECTION_SPECS;
export const SECTION_TYPES = Object.keys(SECTION_SPECS) as SectionType[];

/**
 * Where a page is served: the website's own host, or the portal's for a
 * door that holds a session, such as sign-in. Both are made in the same
 * builder from the same sections.
 */
export const PAGE_KINDS = ["site", "portal"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/**
 * The doors of a school's portal, each a portal page at its own address
 * holding the one system section only the platform can draw there.
 */
export const PORTAL_DOORS = {
  "sign-in": "signIn",
  register: "register",
  apply: "apply",
} as const satisfies Record<string, SectionType>;
export type PortalDoor = keyof typeof PORTAL_DOORS;
export const PORTAL_DOOR_SLUGS = Object.keys(PORTAL_DOORS) as PortalDoor[];

export const isPortalDoor = (slug: string): slug is PortalDoor =>
  slug in PORTAL_DOORS;

/** The section that holds the sign-in form on the portal's sign-in page. */
export const PORTAL_SECTION = PORTAL_DOORS["sign-in"];

/** Sections the builder places itself: never offered, removed or copied. */
export const isSystemSection = (type: SectionType) =>
  SECTION_SPECS[type].category === "system";

/**
 * Whether a page's sections suit its kind: a portal page holds its door's
 * system section exactly once, and a website page holds none.
 */
export function sectionsFitKind(
  kind: PageKind,
  sections: readonly { type: SectionType }[],
  door: PortalDoor = "sign-in",
): boolean {
  const system = sections.filter((section) => isSystemSection(section.type));
  return kind === "portal"
    ? system.length === 1 && system[0]?.type === PORTAL_DOORS[door]
    : system.length === 0;
}
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

const focusSchema = v.optional(pictureFocusSchema);

export const sectionStyleSchema = v.object({
  scheme: v.optional(v.picklist(SCHEMES), "canvas"),
  background: v.optional(
    v.object({
      kind: v.picklist(["none", "image", "video"]),
      fileId: v.nullable(id),
      posterFileId: v.nullable(id),
      overlay: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(80)),
      focus: focusSchema,
    }),
    { kind: "none", fileId: null, posterFileId: null, overlay: 40 },
  ),
  spacing: v.optional(v.picklist(["m", "s", "l"]), "m"),
  width: v.optional(v.picklist(["contained", "wide", "full"]), "contained"),
  align: v.optional(v.picklist(["start", "center"]), "start"),
  dividerTop: v.optional(v.picklist(DIVIDERS), "none"),
  dividerBottom: v.optional(v.picklist(DIVIDERS), "none"),
  pattern: v.optional(v.picklist(PATTERNS), "none"),
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
      return v.object(pictureEntries);
    case "media":
      return v.object({
        kind: v.picklist(["image", "video"]),
        ...pictureEntries,
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
            embedId: v.pipe(v.string(), v.maxLength(400)),
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

/** A block's fields read like a small section's. */
type BlockFields = Record<string, ScalarField | ItemsField>;

function itemsSchema(field: ItemsField): v.GenericSchema {
  return v.pipe(
    v.array(
      v.object({
        id,
        ...Object.fromEntries(
          Object.entries(field.fields).map(([key, inner]) => [
            key,
            v.optional(scalarSchema(inner), () => initialScalar(inner)),
          ]),
        ),
      }),
    ),
    v.maxLength(field.max),
  );
}

function dataSchema(fields: Record<string, Field>): v.GenericSchema {
  // A field added later takes its initial value in content saved before it
  // existed, so that content keeps validating.
  return v.object(
    Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [
        key,
        v.optional(fieldSchema(field), () => initialOf(field)),
      ]),
    ),
  );
}

const blockSchema = v.variant(
  "type",
  BLOCK_TYPES.map((type) =>
    v.object({
      id,
      type: v.literal(type),
      data: dataSchema(BLOCK_SPECS[type].fields),
    }),
  ) as unknown as v.VariantOptions<"type">,
);

function fieldSchema(field: Field): v.GenericSchema {
  if (field.kind === "items") return itemsSchema(field);
  if (field.kind === "columns")
    return v.pipe(
      v.array(
        v.object({
          id,
          blocks: v.pipe(v.array(blockSchema), v.maxLength(MAX_BLOCKS)),
        }),
      ),
      v.minLength(1),
      v.maxLength(field.max),
    );
  return scalarSchema(field);
}

const sectionSchemas = SECTION_TYPES.map((type) => {
  const spec: SectionSpec = SECTION_SPECS[type];
  return v.object({
    id,
    type: v.literal(type),
    variant: v.picklist(spec.variants),
    style: v.optional(sectionStyleSchema, defaultStyle),
    data: dataSchema(spec.fields),
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

function initialData(fields: Record<string, Field>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, initialOf(field)]),
  );
}

function initialOf(field: Field): unknown {
  if (field.kind === "items") return [];
  if (field.kind === "columns")
    return [
      { id: crypto.randomUUID(), blocks: [] },
      { id: crypto.randomUUID(), blocks: [] },
    ];
  return initialScalar(field);
}

/** A new, empty section of a type in its first layout. */
export function newSection<T extends SectionType>(type: T): SectionOf<T> {
  const spec: SectionSpec = SECTION_SPECS[type];
  return {
    id: crypto.randomUUID(),
    type,
    variant: spec.variants[0],
    style: defaultStyle(),
    data: initialData(spec.fields),
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

/**
 * The columns a layout asks for: new ones start empty, and the blocks of
 * columns a narrower layout drops move into its last column.
 */
export function fitColumns(
  columns: SiteColumn[],
  layout: string,
): SiteColumn[] {
  const count = layout.split("-").length;
  if (columns.length === count) return columns;
  if (columns.length < count)
    return [
      ...columns,
      ...Array.from({ length: count - columns.length }, () => ({
        id: crypto.randomUUID(),
        blocks: [],
      })),
    ];
  const kept = columns.slice(0, count);
  const last = kept.at(-1);
  if (!last) return columns;
  return [
    ...kept.slice(0, -1),
    {
      ...last,
      blocks: [
        ...last.blocks,
        ...columns.slice(count).flatMap((column) => column.blocks),
      ],
    },
  ];
}

/** A new, empty block of a kind. */
export function newBlock<T extends BlockType>(type: T): BlockOf<T> {
  return {
    id: crypto.randomUUID(),
    type,
    data: initialData(BLOCK_SPECS[type].fields),
  } as unknown as BlockOf<T>;
}

export const fieldsOf = (type: SectionType): Record<string, Field> =>
  SECTION_SPECS[type].fields;
/** Fields that apply only while another field has a certain value. */
const SHOWN_WHEN: Partial<
  Record<
    SectionType,
    Record<string, (data: Record<string, unknown>) => boolean>
  >
> = {
  events: {
    count: (data) => data.source !== "typed",
    items: (data) => data.source === "typed",
  },
};

/** A section's fields that apply to it as it stands, for the inspector to show. */
export function shownFields(section: PageSection): [string, Field][] {
  const rules = SHOWN_WHEN[section.type] ?? {};
  return Object.entries(fieldsOf(section.type)).filter(
    ([key]) => rules[key]?.(section.data as Record<string, unknown>) ?? true,
  );
}

export const blockFieldsOf = (type: BlockType): BlockFields =>
  BLOCK_SPECS[type].fields;

type Loose = Record<string, unknown>;
type LooseColumn = {
  id: string;
  blocks: { id: string; type: BlockType; data: Loose }[];
};

/** Words as read aloud or searched, without the asterisks that mark emphasis. */
export const withoutEmphasis = (words: string) =>
  words.replace(/\*([^*\n]+)\*/g, "$1");

function scalarWords(field: ScalarField, value: unknown): string[] {
  switch (field.kind) {
    case "text":
      return [withoutEmphasis(value as string)];
    case "rich":
      return [contentPlainText(value as ContentDocument)];
    case "image":
    case "media":
      return [(value as Picture).alt];
    case "links":
      return (value as SiteLink[]).map((link) => link.label);
    default:
      return [];
  }
}

function fieldWords(field: Field, value: unknown): string[] {
  if (field.kind === "items")
    return (value as Loose[]).flatMap((item) =>
      Object.entries(field.fields).flatMap(([key, inner]) =>
        scalarWords(inner, item[key]),
      ),
    );
  if (field.kind === "columns")
    return (value as LooseColumn[]).flatMap((column) =>
      column.blocks.flatMap((block) =>
        dataWords(blockFieldsOf(block.type), block.data),
      ),
    );
  return scalarWords(field, value);
}

function dataWords(fields: Record<string, Field>, data: Loose): string[] {
  return Object.entries(fields).flatMap(([key, field]) =>
    fieldWords(field, data[key]),
  );
}

/** Every piece of wording in a section, in reading order. */
export function sectionWords(section: PageSection): string[] {
  return dataWords(fieldsOf(section.type), section.data);
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
        ...(original as Picture),
        alt: (translated as Picture | undefined)?.alt ?? "",
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
      return { ...(original as Picture), alt: "" };
    case "links":
      return (original as SiteLink[]).map((link) => ({ ...link, label: "" }));
    default:
      return original;
  }
}

function fieldBlank(field: Field, original: unknown): unknown {
  if (field.kind === "items")
    return (original as Loose[]).map((item) => ({
      ...item,
      ...Object.fromEntries(
        Object.entries(field.fields).map(([key, inner]) => [
          key,
          scalarBlank(inner, item[key]),
        ]),
      ),
    }));
  if (field.kind === "columns")
    return (original as LooseColumn[]).map((column) => ({
      ...column,
      blocks: column.blocks.map((block) => ({
        ...block,
        data: dataBlank(blockFieldsOf(block.type), block.data),
      })),
    }));
  return scalarBlank(field, original);
}

function dataBlank(fields: Record<string, Field>, data: Loose): Loose {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      fieldBlank(field, data[key]),
    ]),
  );
}

function fieldOverlay(
  field: Field,
  original: unknown,
  translated: unknown,
): unknown {
  if (field.kind === "items") {
    const byId = new Map(
      ((translated as Loose[] | undefined) ?? []).map((item) => [
        item.id,
        item,
      ]),
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
  if (field.kind === "columns") {
    const blocks = new Map(
      ((translated as LooseColumn[] | undefined) ?? [])
        .flatMap((column) => column.blocks)
        .map((block) => [block.id, block]),
    );
    return (original as LooseColumn[]).map((column) => ({
      ...column,
      blocks: column.blocks.map((block) => {
        const match = blocks.get(block.id);
        const fields = blockFieldsOf(block.type);
        return {
          ...block,
          data:
            match && match.type === block.type
              ? dataOverlay(fields, block.data, match.data)
              : dataBlank(fields, block.data),
        };
      }),
    }));
  }
  return scalarOverlay(field, original, translated);
}

function dataOverlay(
  fields: Record<string, Field>,
  original: Loose,
  translated: Loose,
): Loose {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      fieldOverlay(field, original[key], translated[key]),
    ]),
  );
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
  return {
    ...original,
    data: dataOverlay(fieldsOf(original.type), original.data, translated.data),
  } as PageSection;
}

/** A section's structure with none of its words, where a translation starts. */
export function wordless(section: PageSection): PageSection {
  return {
    ...section,
    data: dataBlank(fieldsOf(section.type), section.data),
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
      return [(value as Picture).fileId].filter((fileId): fileId is string =>
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

/** Applies a check to every scalar value in some data, however deeply its blocks nest. */
function eachScalar<R>(
  fields: Record<string, Field>,
  data: Loose,
  visit: (field: ScalarField, value: unknown) => R[],
): R[] {
  return Object.entries(fields).flatMap(([key, field]) => {
    const value = data[key];
    if (field.kind === "items")
      return (value as Loose[]).flatMap((item) =>
        Object.entries(field.fields).flatMap(([inner, innerField]) =>
          visit(innerField, item[inner]),
        ),
      );
    if (field.kind === "columns")
      return (value as LooseColumn[]).flatMap((column) =>
        column.blocks.flatMap((block) =>
          eachScalar(blockFieldsOf(block.type), block.data, visit),
        ),
      );
    return visit(field, value);
  });
}

/** Every file a section shows: pictures, videos, posters, captions and background. */
export function sectionFileIds(section: PageSection): string[] {
  const found = eachScalar(
    fieldsOf(section.type),
    section.data as Loose,
    scalarFiles,
  );
  const background = section.style.background;
  if (background.kind !== "none")
    for (const fileId of [background.fileId, background.posterFileId])
      if (fileId) found.push(fileId);
  return [...new Set(found)];
}

/** Some data with every scalar value passed through a change, however deeply its blocks nest. */
function mapScalars(
  fields: Record<string, Field>,
  data: Loose,
  change: (field: ScalarField, value: unknown) => unknown,
): Loose {
  const next: Loose = { ...data };
  for (const [key, field] of Object.entries(fields)) {
    const value = data[key];
    if (field.kind === "items")
      next[key] = (value as Loose[]).map((item) =>
        Object.fromEntries([
          ["id", item.id],
          ...Object.entries(field.fields).map(([inner, innerField]) => [
            inner,
            change(innerField, item[inner]),
          ]),
        ]),
      );
    else if (field.kind === "columns")
      next[key] = (value as LooseColumn[]).map((column) => ({
        id: column.id,
        blocks: column.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          data: mapScalars(blockFieldsOf(block.type), block.data, change),
        })),
      }));
    else next[key] = change(field, value);
  }
  return next;
}

/** A section with each of its rich bodies, in blocks and items too, changed. */
export function mapSectionBodies(
  section: PageSection,
  change: (body: ContentDocument) => ContentDocument,
): PageSection {
  return {
    ...section,
    data: mapScalars(fieldsOf(section.type), section.data, (field, value) =>
      field.kind === "rich" && value ? change(value as ContentDocument) : value,
    ),
  } as PageSection;
}

export type SiteIssueCode =
  | "alt"
  | "heading"
  | "link"
  | "action"
  | "captions"
  | "label"
  | "form_contact"
  | "form_question";
export interface SiteIssue {
  sectionId: string;
  code: SiteIssueCode;
}

/**
 * What a rich body must not do on a page: hide pictures, say "click here",
 * or compete with the section's own heading through a first-level one.
 */
export function bodyIssues(body: ContentDocument): SiteIssueCode[] {
  const found = new Set<SiteIssueCode>(
    contentIssues(body).filter((code) => code !== "order"),
  );
  if (hasFirstLevelHeading(body)) found.add("heading");
  return [...found];
}

function scalarIssues(field: ScalarField, value: unknown): SiteIssueCode[] {
  switch (field.kind) {
    case "image": {
      return pictureNeedsAlt(value as Picture) ? ["alt"] : [];
    }
    case "media": {
      const media = value as SiteMedia;
      if (!media.fileId) return [];
      if (media.kind === "video")
        return media.captionsFileId ? [] : ["captions"];
      return pictureNeedsAlt(media) ? ["alt"] : [];
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
  return [
    ...new Set([
      ...eachScalar(
        fieldsOf(section.type),
        section.data as Loose,
        scalarIssues,
      ),
      ...(section.type === "form" ? formIssues(section) : []),
    ]),
  ];
}

/**
 * A form must leave the family a way to be answered, and a choice it asks
 * must offer two options. A question without words is not shown, as any
 * empty field, so it stops nothing.
 */
function formIssues(section: SectionOf<"form">): SiteIssueCode[] {
  const found: SiteIssueCode[] = [];
  if (section.data.email === "hide" && section.data.phone === "hide")
    found.push("form_contact");
  if (
    section.data.questions.some(
      (question) =>
        question.label.trim() !== "" &&
        question.answer === "choice" &&
        optionsOf(question.options).length < 2,
    )
  )
    found.push("form_question");
  return found;
}

/** Whether a field of a repeating item applies to the item as it stands. */
export function itemFieldShown(field: ScalarField, item: Loose): boolean {
  return field.kind !== "text" || !field.when
    ? true
    : item[field.when.field] === field.when.is;
}
