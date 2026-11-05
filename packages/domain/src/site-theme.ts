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
  headingScale: HeadingScale;
  card: CardStyle;
  image: ImageShape;
  eyebrow: EyebrowStyle;
  motion: Motion;
  emphasis: Emphasis;
  photoTone: PhotoTone;
}

/**
 * The platform's own green as a website palette, for the sign-in page of a
 * school that never styled its website. The app's brand tokens in
 * globals.css are the same colours.
 */
export const PLATFORM_PALETTE: Palette = {
  canvas: "#ffffff",
  surface: "#eef3ee",
  primary: "#153f3a",
  accent: "#c7d9b8",
  ink: "#18221f",
};

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
      canvas: "#FFFFFF",
      surface: "#EEF3F9",
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
      primary: "#1A64C6",
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

/** A colour in OKLCH: lightness 0 to 1, chroma from 0, hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) =>
  c <= 0.003_130_8 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function toOklab(colour: string): [number, number, number] {
  const [r, g, b] = channels(colour).map(toLinear) as [number, number, number];
  const l = Math.cbrt(
    0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b,
  );
  const m = Math.cbrt(
    0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b,
  );
  const s = Math.cbrt(
    0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b,
  );
  return [
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  ];
}

/** Linear sRGB of an OKLab colour, which may fall outside the gamut. */
function labToLinear(
  L: number,
  a: number,
  b: number,
): [number, number, number] {
  const l = (L + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (L - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (L - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

export function toOklch(colour: string): Oklch {
  const [l, a, b] = toOklab(colour);
  const c = Math.hypot(a, b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c, h: h < 0 ? h + 360 : h };
}

const inGamut = (rgb: number[]) =>
  rgb.every((channel) => channel >= -0.000_1 && channel <= 1.000_1);

const hexOf = (rgb: number[]) =>
  `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(channel))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * The colour an OKLCH value names, keeping its lightness and hue and giving
 * up only as much chroma as the screen cannot show.
 */
export function fromOklch({ l, c, h }: Oklch): string {
  const lightness = Math.min(1, Math.max(0, l));
  const angle = (h * Math.PI) / 180;
  const at = (chroma: number) =>
    labToLinear(lightness, chroma * Math.cos(angle), chroma * Math.sin(angle));
  if (inGamut(at(c))) return hexOf(at(c));
  let low = 0;
  let high = c;
  for (let step = 0; step < 20; step++) {
    const mid = (low + high) / 2;
    if (inGamut(at(mid))) low = mid;
    else high = mid;
  }
  return hexOf(at(low));
}

/** The same colour at another lightness, its hue kept and its chroma scaled. */
export function tone(colour: string, lightness: number, chroma = 1): string {
  const { c, h } = toOklch(colour);
  return fromOklch({ l: lightness, c: c * chroma, h });
}

/** A colour a fraction of the way from one to another, mixed in OKLab so it never passes through grey. */
export function mix(from: string, to: string, amount: number): string {
  const a = toOklab(from);
  const b = toOklab(to);
  const [L, A, B] = a.map(
    (channel, index) => channel + ((b[index] ?? 0) - channel) * amount,
  ) as [number, number, number];
  const rgb = labToLinear(L, A, B);
  return inGamut(rgb)
    ? hexOf(rgb)
    : fromOklch({
        l: L,
        c: Math.hypot(A, B),
        h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
      });
}

/** Chroma below which a colour reads as grey rather than as a hue. */
const NEUTRAL = 0.035;

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
  /** A quiet fill in the link's hue for icon tiles and tags. */
  tint: string;
}

/**
 * A fill in the link's own hue a step off the background. Mixing the link
 * into the background instead cancels to grey wherever the two are
 * complementary (a blue link on a cream section); a link with no hue of its
 * own (white on a brand band) is laid over the band instead.
 */
function tintOf(link: string, background: string): string {
  const ink = toOklch(link);
  if (ink.c < NEUTRAL) return mix(background, link, 0.16);
  const ground = toOklch(background);
  const dark = ground.l < 0.5;
  return fromOklch({
    l: dark ? ground.l + 0.08 : ground.l - 0.045,
    c: Math.min(Math.max(ink.c * 0.4, 0.025), ink.c, 0.07),
    h: ink.h,
  });
}

/**
 * A school colour lifted to read on a dark page: its hue and chroma kept and
 * its lightness raised until it clears 4.5:1 with room to spare. A colour
 * with no hue to keep (a black brand) becomes near-white, never a mid grey.
 */
function lifted(colour: string, background: string): string {
  const { l, c: own, h } = toOklch(colour);
  if (own < NEUTRAL) return fromOklch({ l: 0.94, c: own, h });
  // The same chroma looks weaker at a higher lightness.
  const c = Math.min(own * 1.3, 0.2);
  for (
    let lightness = Math.max(l, 0.62);
    lightness <= 0.92;
    lightness += 0.02
  ) {
    const candidate = fromOklch({ l: lightness, c, h });
    if (contrast(candidate, background) >= 5.5) return candidate;
  }
  return fromOklch({ l: 0.92, c, h });
}

/**
 * The palette a page takes when the person reading it chose a dark screen:
 * near-black surfaces tinted with the school's hue, light ink, and the
 * school's colours lifted in lightness alone so they stay recognisably its
 * own.
 */
export function darkPalette(palette: Palette): Palette {
  const { c, h } = toOklch(palette.primary);
  const tint = Math.min(c * 0.35, 0.022);
  const canvas = fromOklch({ l: 0.17, c: tint, h });
  return {
    canvas,
    surface: fromOklch({ l: 0.215, c: tint, h }),
    primary: lifted(palette.primary, canvas),
    accent: lifted(palette.accent, canvas),
    ink: fromOklch({ l: 0.95, c: Math.min(tint, 0.008), h }),
  };
}

/** The school's band and its ink band on a dark screen, and whether each needs an edge. */
export interface DarkBands {
  primary: string;
  ink: string;
  /** Too close to the page to part from it by colour, so a hairline marks it. */
  edged: { primary: boolean; ink: boolean };
}

/**
 * Bands on a dark screen. A coloured brand keeps its colour, raised only
 * until it parts from the page; a black or grey brand lightened that way
 * becomes a flat mid grey, so it stays near-black, a step above the page,
 * and takes an edge. The ink band sinks below the page, as a footer does.
 */
export function darkBands(palette: Palette): DarkBands {
  const page = darkPalette(palette).canvas;
  const { c, h } = toOklch(page);
  const apart = (colour: string) => {
    for (let amount = 0; amount <= 0.3; amount += 0.02) {
      const candidate = mix(colour, "#FFFFFF", amount);
      if (contrast(candidate, page) >= 1.3) return candidate;
    }
    return mix(colour, "#FFFFFF", 0.3);
  };
  const primary =
    toOklch(palette.primary).c < NEUTRAL
      ? fromOklch({ l: 0.235, c, h })
      : apart(palette.primary);
  const ink = fromOklch({ l: 0.115, c, h });
  return {
    primary,
    ink,
    edged: {
      primary: contrast(primary, page) < 1.3,
      ink: contrast(ink, page) < 1.3,
    },
  };
}

/** The colours artwork is drawn in where no photograph has been chosen. */
export interface ArtPalette {
  /** The darkest tone, which words in white sit on. */
  deep: string;
  base: string;
  bright: string;
  light: string;
  accent: string;
}

/**
 * Artwork colours in one family: tones of the school's main hue, from deep
 * enough for white words to pale, and its accent. A school whose main colour
 * is black or grey gets charcoal tones; its accent is then drawn as crisp
 * shapes only, since a bright colour blurred into near-black turns olive.
 */
export function artPalette(palette: Palette): ArtPalette {
  const primary = toOklch(palette.primary);
  const accent = toOklch(palette.accent);
  const neutral = primary.c < NEUTRAL;
  const { h } = primary;
  const c = neutral ? Math.min(primary.c, 0.012) : Math.max(primary.c, 0.08);
  const deep = fromOklch({ l: neutral ? 0.19 : 0.26, c: c * 0.8, h });
  // Only as light as it must be to read as a shape on the deep ground (3:1):
  // a fixed floor washed a crimson out to salmon.
  let lightness = Math.min(accent.l, 0.84);
  const accentAt = (l: number) => fromOklch({ l, c: accent.c, h: accent.h });
  while (lightness < 0.84 && contrast(accentAt(lightness), deep) < 3)
    lightness += 0.01;
  return {
    deep,
    base: fromOklch({ l: neutral ? 0.3 : 0.4, c, h }),
    bright: fromOklch({ l: neutral ? 0.5 : 0.58, c: c * 1.1, h }),
    light: fromOklch({ l: 0.92, c: c * 0.3, h }),
    accent: accentAt(lightness),
  };
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
    const link = readable(background, [palette.primary, palette.accent, body]);
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
      link,
      border: mix(body, background, 0.84),
      // On a dark background a card is raised by being lighter, never sunk.
      card:
        luminance(background) < 0.18 && luminance(card) <= luminance(background)
          ? mix(background, "#FFFFFF", 0.06)
          : card,
      button,
      buttonText: readable(button, ["#FFFFFF", palette.canvas, palette.ink]),
      tint: tintOf(link, background),
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
 * The site's frame, set once for every page: the links above the menu, the
 * actions beside it (Enquire, Visit, Apply), the footer, and the action dock
 * phones keep at the bottom. The logo it shows is the school's own.
 */
export const siteChromeSchema = v.object({
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
