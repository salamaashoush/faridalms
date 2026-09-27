import * as v from "valibot";

import { isSiteHref } from "./site-links";

export const THEME_IDS = [
  "heritage",
  "meridian",
  "brightStart",
  "oasis",
  "editorial",
  "evergreen",
  "civic",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const SCHEMES = ["canvas", "soft", "brand", "accent", "ink"] as const;
export type SchemeId = (typeof SCHEMES)[number];

export const RADII = [0, 4, 8, 16, 24] as const;
export const BUTTON_SHAPES = ["square", "rounded", "pill"] as const;
export const DENSITIES = ["compact", "regular", "airy"] as const;
export const HEADERS = ["classic", "centered", "overlay", "minimal"] as const;
export const FOOTERS = ["sitemap", "compact", "contact"] as const;
export const HEADING_CASES = ["none", "upper"] as const;
export const DIVIDERS = ["none", "curve", "wave", "angle"] as const;
export const HEADING_SCALES = ["classic", "editorial", "statement"] as const;
export const EMPHASES = [
  "italic",
  "weight",
  "colour",
  "highlight",
  "underline",
] as const;
export const CARD_STYLES = ["flat", "outlined", "raised"] as const;
export const IMAGE_SHAPES = ["square", "rounded", "arch", "leaf"] as const;
export const EYEBROWS = ["plain", "rule", "pill"] as const;
export const MOTIONS = ["none", "subtle", "lively"] as const;
export const PHOTO_TONES = ["natural", "warm", "mono", "duotone"] as const;

export type Radius = (typeof RADII)[number];
export type ButtonShape = (typeof BUTTON_SHAPES)[number];
export type Density = (typeof DENSITIES)[number];
export type HeaderStyle = (typeof HEADERS)[number];
export type FooterStyle = (typeof FOOTERS)[number];
export type HeadingCase = (typeof HEADING_CASES)[number];
export type Divider = (typeof DIVIDERS)[number];
export type HeadingScale = (typeof HEADING_SCALES)[number];
export type CardStyle = (typeof CARD_STYLES)[number];
export type ImageShape = (typeof IMAGE_SHAPES)[number];
export type EyebrowStyle = (typeof EYEBROWS)[number];
export type Motion = (typeof MOTIONS)[number];
export type Emphasis = (typeof EMPHASES)[number];
export type PhotoTone = (typeof PHOTO_TONES)[number];

export interface FontFace {
  /** The CSS family name the self-hosted font registers. */
  family: string;
  fallback: "serif" | "sans-serif";
  scripts: readonly ("latin" | "arabic")[];
}

/** Every face is SIL OFL and self-hosted, so no visitor's address reaches a font CDN. */
export const FONTS = {
  cormorant: {
    family: "Cormorant Garamond Variable",
    fallback: "serif",
    scripts: ["latin"],
  },
  sourceSans: {
    family: "Source Sans 3 Variable",
    fallback: "sans-serif",
    scripts: ["latin"],
  },
  ibmPlexSans: {
    family: "IBM Plex Sans Variable",
    fallback: "sans-serif",
    scripts: ["latin"],
  },
  plusJakarta: {
    family: "Plus Jakarta Sans Variable",
    fallback: "sans-serif",
    scripts: ["latin"],
  },
  inter: {
    family: "Inter Variable",
    fallback: "sans-serif",
    scripts: ["latin"],
  },
  fraunces: {
    family: "Fraunces Variable",
    fallback: "serif",
    scripts: ["latin"],
  },
  nunitoSans: {
    family: "Nunito Sans Variable",
    fallback: "sans-serif",
    scripts: ["latin"],
  },
  notoSans: {
    family: "Noto Sans Variable",
    fallback: "sans-serif",
    scripts: ["latin"],
  },
  alexandria: {
    family: "Alexandria Variable",
    fallback: "sans-serif",
    scripts: ["latin", "arabic"],
  },
  balooBhaijaan: {
    family: "Baloo Bhaijaan 2 Variable",
    fallback: "sans-serif",
    scripts: ["latin", "arabic"],
  },
  rubik: {
    family: "Rubik Variable",
    fallback: "sans-serif",
    scripts: ["latin", "arabic"],
  },
  elMessiri: {
    family: "El Messiri Variable",
    fallback: "sans-serif",
    scripts: ["latin", "arabic"],
  },
  cairo: {
    family: "Cairo Variable",
    fallback: "sans-serif",
    scripts: ["latin", "arabic"],
  },
  readexPro: {
    family: "Readex Pro Variable",
    fallback: "sans-serif",
    scripts: ["latin", "arabic"],
  },
  amiri: { family: "Amiri", fallback: "serif", scripts: ["arabic"] },
  notoNaskh: {
    family: "Noto Naskh Arabic Variable",
    fallback: "serif",
    scripts: ["arabic"],
  },
  ibmPlexArabic: {
    family: "IBM Plex Sans Arabic",
    fallback: "sans-serif",
    scripts: ["arabic"],
  },
  markazi: {
    family: "Markazi Text Variable",
    fallback: "serif",
    scripts: ["arabic"],
  },
  tajawal: { family: "Tajawal", fallback: "sans-serif", scripts: ["arabic"] },
  notoKufi: {
    family: "Noto Kufi Arabic Variable",
    fallback: "sans-serif",
    scripts: ["arabic"],
  },
  notoSansArabic: {
    family: "Noto Sans Arabic Variable",
    fallback: "sans-serif",
    scripts: ["arabic"],
  },
} as const satisfies Record<string, FontFace>;
export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const fontsFor = (script: "latin" | "arabic") =>
  FONT_IDS.filter((font) =>
    (FONTS[font].scripts as readonly string[]).includes(script),
  );

export interface Palette {
  canvas: string;
  surface: string;
  primary: string;
  accent: string;
  ink: string;
}

export interface Theme {
  id: ThemeId;
  palette: Palette;
  fonts: {
    headingLatin: FontId;
    bodyLatin: FontId;
    headingArabic: FontId;
    bodyArabic: FontId;
  };
  radius: Radius;
  button: ButtonShape;
  density: Density;
  header: HeaderStyle;
  footer: FooterStyle;
  headingCase: HeadingCase;
  divider: Divider;
  headingScale: HeadingScale;
  card: CardStyle;
  image: ImageShape;
  eyebrow: EyebrowStyle;
  motion: Motion;
  emphasis: Emphasis;
  photoTone: PhotoTone;
}

/**
 * The themes a school starts from, each measured against the kind of school
 * site it answers (website-builder.md, section 4.2).
 */
export const THEMES: Record<ThemeId, Theme> = {
  heritage: {
    id: "heritage",
    palette: {
      canvas: "#F7F4EC",
      surface: "#ECE6D8",
      primary: "#1F2A44",
      accent: "#9B1B30",
      ink: "#1A1A1A",
    },
    fonts: {
      headingLatin: "cormorant",
      bodyLatin: "sourceSans",
      headingArabic: "amiri",
      bodyArabic: "notoNaskh",
    },
    radius: 0,
    button: "square",
    density: "airy",
    header: "centered",
    footer: "sitemap",
    headingCase: "none",
    divider: "none",
    headingScale: "editorial",
    card: "outlined",
    image: "arch",
    eyebrow: "rule",
    photoTone: "warm",
    emphasis: "italic",
    motion: "subtle",
  },
  meridian: {
    id: "meridian",
    palette: {
      canvas: "#F8F9FB",
      surface: "#EAF0F7",
      primary: "#0B3D91",
      accent: "#0FA3A3",
      ink: "#0F172A",
    },
    fonts: {
      headingLatin: "alexandria",
      bodyLatin: "ibmPlexSans",
      headingArabic: "alexandria",
      bodyArabic: "ibmPlexArabic",
    },
    radius: 8,
    button: "rounded",
    density: "regular",
    header: "classic",
    footer: "sitemap",
    headingCase: "none",
    divider: "none",
    headingScale: "classic",
    card: "raised",
    image: "rounded",
    eyebrow: "pill",
    photoTone: "natural",
    emphasis: "colour",
    motion: "subtle",
  },
  brightStart: {
    id: "brightStart",
    palette: {
      canvas: "#FFF9EF",
      surface: "#FFEFD2",
      primary: "#1E6FD9",
      accent: "#FFC845",
      ink: "#1F2937",
    },
    fonts: {
      headingLatin: "balooBhaijaan",
      bodyLatin: "rubik",
      headingArabic: "balooBhaijaan",
      bodyArabic: "rubik",
    },
    radius: 24,
    button: "pill",
    density: "regular",
    header: "classic",
    footer: "contact",
    headingCase: "none",
    divider: "wave",
    headingScale: "classic",
    card: "raised",
    image: "leaf",
    eyebrow: "pill",
    photoTone: "natural",
    emphasis: "underline",
    motion: "lively",
  },
  oasis: {
    id: "oasis",
    palette: {
      canvas: "#F6F1E7",
      surface: "#E9E0CF",
      primary: "#004D5A",
      accent: "#B29A51",
      ink: "#14272B",
    },
    fonts: {
      headingLatin: "elMessiri",
      bodyLatin: "cairo",
      headingArabic: "elMessiri",
      bodyArabic: "cairo",
    },
    radius: 16,
    button: "pill",
    density: "regular",
    header: "overlay",
    footer: "contact",
    headingCase: "none",
    divider: "none",
    headingScale: "editorial",
    card: "flat",
    image: "arch",
    eyebrow: "rule",
    photoTone: "warm",
    emphasis: "colour",
    motion: "subtle",
  },
  editorial: {
    id: "editorial",
    palette: {
      canvas: "#FFFFFF",
      surface: "#F2F2F0",
      primary: "#101010",
      accent: "#F5C400",
      ink: "#101010",
    },
    fonts: {
      headingLatin: "plusJakarta",
      bodyLatin: "inter",
      headingArabic: "readexPro",
      bodyArabic: "readexPro",
    },
    radius: 0,
    button: "pill",
    density: "airy",
    header: "minimal",
    footer: "compact",
    headingCase: "none",
    divider: "none",
    headingScale: "statement",
    card: "flat",
    image: "square",
    eyebrow: "plain",
    photoTone: "mono",
    emphasis: "weight",
    motion: "lively",
  },
  evergreen: {
    id: "evergreen",
    palette: {
      canvas: "#FBF8F2",
      surface: "#EEF0E6",
      primary: "#1F3D2B",
      accent: "#C8643B",
      ink: "#1B1F1A",
    },
    fonts: {
      headingLatin: "fraunces",
      bodyLatin: "nunitoSans",
      headingArabic: "markazi",
      bodyArabic: "tajawal",
    },
    radius: 16,
    button: "rounded",
    density: "airy",
    header: "centered",
    footer: "sitemap",
    headingCase: "none",
    divider: "curve",
    headingScale: "editorial",
    card: "outlined",
    image: "leaf",
    eyebrow: "rule",
    photoTone: "natural",
    emphasis: "italic",
    motion: "subtle",
  },
  civic: {
    id: "civic",
    palette: {
      canvas: "#FFFFFF",
      surface: "#F1F4F8",
      primary: "#12355B",
      accent: "#D14900",
      ink: "#111111",
    },
    fonts: {
      headingLatin: "notoSans",
      bodyLatin: "notoSans",
      headingArabic: "notoKufi",
      bodyArabic: "notoSansArabic",
    },
    radius: 4,
    button: "rounded",
    density: "compact",
    header: "classic",
    footer: "sitemap",
    headingCase: "none",
    divider: "none",
    headingScale: "classic",
    card: "outlined",
    image: "square",
    eyebrow: "plain",
    photoTone: "natural",
    emphasis: "colour",
    motion: "none",
  },
};

const hex = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, "site.colour"));
const font = v.picklist(FONT_IDS as [FontId, ...FontId[]]);

/** What a school stored: a theme and the choices it made on top of it. */
export const siteThemeSchema = v.object({
  id: v.optional(v.picklist(THEME_IDS), "meridian"),
  palette: v.optional(
    v.object({
      canvas: v.optional(hex),
      surface: v.optional(hex),
      primary: v.optional(hex),
      accent: v.optional(hex),
      ink: v.optional(hex),
    }),
    {},
  ),
  fonts: v.optional(
    v.object({
      headingLatin: v.optional(font),
      bodyLatin: v.optional(font),
      headingArabic: v.optional(font),
      bodyArabic: v.optional(font),
    }),
    {},
  ),
  radius: v.optional(v.picklist(RADII)),
  button: v.optional(v.picklist(BUTTON_SHAPES)),
  density: v.optional(v.picklist(DENSITIES)),
  header: v.optional(v.picklist(HEADERS)),
  footer: v.optional(v.picklist(FOOTERS)),
  headingCase: v.optional(v.picklist(HEADING_CASES)),
  divider: v.optional(v.picklist(DIVIDERS)),
  headingScale: v.optional(v.picklist(HEADING_SCALES)),
  card: v.optional(v.picklist(CARD_STYLES)),
  image: v.optional(v.picklist(IMAGE_SHAPES)),
  eyebrow: v.optional(v.picklist(EYEBROWS)),
  motion: v.optional(v.picklist(MOTIONS)),
  emphasis: v.optional(v.picklist(EMPHASES)),
  photoTone: v.optional(v.picklist(PHOTO_TONES)),
});
export type SiteTheme = v.InferOutput<typeof siteThemeSchema>;

/** The theme a school's choices add up to. */
export function resolveTheme(choice: SiteTheme | null | undefined): Theme {
  const base = THEMES[choice?.id ?? "meridian"];
  if (!choice) return base;
  return {
    ...base,
    palette: { ...base.palette, ...choice.palette },
    fonts: { ...base.fonts, ...choice.fonts },
    radius: choice.radius ?? base.radius,
    button: choice.button ?? base.button,
    density: choice.density ?? base.density,
    header: choice.header ?? base.header,
    footer: choice.footer ?? base.footer,
    headingCase: choice.headingCase ?? base.headingCase,
    divider: choice.divider ?? base.divider,
    headingScale: choice.headingScale ?? base.headingScale,
    card: choice.card ?? base.card,
    image: choice.image ?? base.image,
    eyebrow: choice.eyebrow ?? base.eyebrow,
    motion: choice.motion ?? base.motion,
    emphasis: choice.emphasis ?? base.emphasis,
    photoTone: choice.photoTone ?? base.photoTone,
  };
}

function channels(colour: string): [number, number, number] {
  const value = Number.parseInt(colour.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(colour: string): number {
  const [r, g, b] = channels(colour).map((channel) => {
    const c = channel / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted(
    (x, y) => y - x,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** A colour a fraction of the way from one to another. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((channel, index) =>
      Math.round(channel + ((b[index] ?? 0) - channel) * amount),
    )
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The first colour that reads on the background at the ratio asked, else black or white. */
function readable(
  background: string,
  candidates: string[],
  ratio = 4.5,
): string {
  const found = candidates.find(
    (candidate) => contrast(candidate, background) >= ratio,
  );
  if (found) return found;
  return contrast("#000000", background) >= contrast("#FFFFFF", background)
    ? "#000000"
    : "#FFFFFF";
}

export interface Scheme {
  background: string;
  heading: string;
  body: string;
  muted: string;
  link: string;
  border: string;
  card: string;
  button: string;
  buttonText: string;
}

/**
 * The five colour schemes a section chooses from, generated from the palette
 * so every text colour meets WCAG AA on its background (4.5:1 for text, 3:1
 * for buttons against the section).
 */
export function schemesOf(palette: Palette): Record<SchemeId, Scheme> {
  const build = (
    background: string,
    card: string,
    preferText: string[],
    preferButton: string[],
  ): Scheme => {
    const body = readable(background, preferText);
    const button =
      preferButton.find((colour) => contrast(colour, background) >= 3) ?? body;
    return {
      background,
      heading: body,
      body,
      muted: readable(background, [
        mix(body, background, 0.35),
        mix(body, background, 0.2),
      ]),
      link: readable(background, [palette.primary, palette.accent, body]),
      border: mix(body, background, 0.82),
      card,
      button,
      buttonText: readable(button, ["#FFFFFF", palette.canvas, palette.ink]),
    };
  };
  return {
    canvas: build(
      palette.canvas,
      palette.surface,
      [palette.ink],
      [palette.primary, palette.accent],
    ),
    soft: build(
      palette.surface,
      palette.canvas,
      [palette.ink],
      [palette.primary, palette.accent],
    ),
    brand: build(
      palette.primary,
      mix(palette.primary, "#FFFFFF", 0.1),
      [palette.canvas, "#FFFFFF"],
      [palette.accent, palette.canvas, "#FFFFFF"],
    ),
    accent: build(
      palette.accent,
      mix(palette.accent, "#FFFFFF", 0.15),
      [palette.ink, "#FFFFFF"],
      [palette.primary, palette.ink, "#FFFFFF"],
    ),
    ink: build(
      palette.ink,
      mix(palette.ink, "#FFFFFF", 0.08),
      [palette.canvas, "#FFFFFF"],
      [palette.accent, palette.canvas],
    ),
  };
}

/** Palette roles that fail against their own scheme, for the styles panel to warn about. */
export function paletteWarnings(palette: Palette): SchemeId[] {
  const schemes = schemesOf(palette);
  return SCHEMES.filter((scheme) => {
    const current = schemes[scheme];
    return (
      contrast(current.body, current.background) < 4.5 ||
      contrast(current.button, current.background) < 3
    );
  });
}

const label = (max: number) =>
  v.object({
    en: v.pipe(v.string(), v.trim(), v.maxLength(max)),
    ar: v.pipe(v.string(), v.trim(), v.maxLength(max)),
  });
const id = v.pipe(v.string(), v.uuid());
const href = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.check(isSiteHref, "site.link"),
);
const link = v.object({ id, label: label(40), href });

/**
 * The site's frame, set once for every page: its logo, the links above the
 * menu, the actions beside it (Enquire, Visit, Apply), the footer, and the
 * action dock phones keep at the bottom.
 */
export const siteChromeSchema = v.object({
  logoFileId: v.optional(v.nullable(id), null),
  utility: v.optional(v.pipe(v.array(link), v.maxLength(6)), []),
  actions: v.optional(
    v.pipe(
      v.array(
        v.object({
          ...link.entries,
          style: v.picklist(["primary", "secondary"]),
        }),
      ),
      v.maxLength(3),
    ),
    [],
  ),
  footerColumns: v.optional(
    v.pipe(
      v.array(
        v.object({
          id,
          title: label(60),
          links: v.pipe(v.array(link), v.maxLength(8)),
        }),
      ),
      v.maxLength(4),
    ),
    [],
  ),
  footerNote: v.optional(label(300), { en: "", ar: "" }),
  dock: v.optional(v.boolean(), true),
});
export type SiteChrome = v.InferOutput<typeof siteChromeSchema>;
export type ChromeLink = SiteChrome["utility"][number];

export const emptyChrome = (): SiteChrome => v.parse(siteChromeSchema, {});
export const defaultTheme = (): SiteTheme => v.parse(siteThemeSchema, {});
