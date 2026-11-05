import type { PictureFocus } from "@faridalms/domain/commons";
import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { SchemeId, Theme } from "@faridalms/domain/site-theme";
import type { CSSProperties } from "react";

import {
  artPalette,
  darkBands,
  darkPalette,
  FONTS,
  schemesOf,
} from "@faridalms/domain/site-theme";

/** Section padding for each density, measured against school sites that read as designed. */
const SPACE = {
  compact: "clamp(3rem, 2.333rem + 2.963cqi, 5rem)",
  regular: "clamp(4rem, 2.833rem + 5.185cqi, 7.5rem)",
  airy: "clamp(5rem, 3.667rem + 5.926cqi, 9rem)",
} as const;

/** Faces with a real italic, which the italic emphasis borrows; others fall back to Fraunces. */
const ITALIC_FACES = new Set(["cormorant", "fraunces"]);

function stack(font: keyof typeof FONTS, fallback: keyof typeof FONTS): string {
  const face = FONTS[font];
  return `"${face.family}", "${FONTS[fallback].family}", ${face.fallback}`;
}

/**
 * The theme as CSS variables on the site's root, in the language shown:
 * Arabic takes the theme's Arabic faces, a taller line and no letter-spacing
 * or capitals, which would break its joins.
 */
export function themeStyle(theme: Theme, locale: SiteLocale): CSSProperties {
  const arabic = locale === "ar";
  const heading = arabic
    ? stack(theme.fonts.headingArabic, theme.fonts.bodyArabic)
    : stack(theme.fonts.headingLatin, theme.fonts.bodyLatin);
  const body = arabic
    ? stack(theme.fonts.bodyArabic, "notoSansArabic")
    : stack(theme.fonts.bodyLatin, "inter");
  const art = artPalette(theme.palette);
  return {
    "--s-font-heading": heading,
    "--s-font-body": body,
    // Words in the other script, such as the language switch, keep their own face.
    "--s-font-latin": stack(theme.fonts.bodyLatin, "inter"),
    "--s-font-arabic": stack(theme.fonts.bodyArabic, "notoSansArabic"),
    "--s-radius": `${theme.radius}px`,
    "--s-art-deep": art.deep,
    "--s-art-base": art.base,
    "--s-art-bright": art.bright,
    "--s-art-light": art.light,
    "--s-art-accent": art.accent,
    "--s-button-radius":
      theme.button === "pill"
        ? "999px"
        : theme.button === "square"
          ? "0px"
          : `${Math.max(theme.radius, 6)}px`,
    "--s-space": SPACE[theme.density],
    "--s-heading-case":
      theme.headingCase === "upper" && !arabic ? "uppercase" : "none",
    "--s-heading-tracking":
      theme.headingCase === "upper" && !arabic ? "0.04em" : "normal",
    "--s-line": arabic ? "1.8" : "1.6",
    "--s-font-accent": ITALIC_FACES.has(theme.fonts.headingLatin)
      ? `"${FONTS[theme.fonts.headingLatin].family}", serif`
      : `"${FONTS.fraunces.family}", serif`,
    "--s-heading-weight":
      theme.headingScale === "statement"
        ? "800"
        : theme.headingScale === "editorial"
          ? FONTS[arabic ? theme.fonts.headingArabic : theme.fonts.headingLatin]
              .fallback === "serif"
            ? "500"
            : "600"
          : "650",
    "--s-display-tracking":
      arabic || theme.headingCase === "upper"
        ? "normal"
        : theme.headingScale === "statement"
          ? "-0.04em"
          : theme.headingScale === "editorial"
            ? "-0.02em"
            : "-0.01em",
    "--s-eyebrow-case": arabic ? "none" : "uppercase",
    "--s-eyebrow-tracking": arabic ? "normal" : "0.14em",
    "--s-canvas": theme.palette.canvas,
    "--s-surface": theme.palette.surface,
    "--s-primary": theme.palette.primary,
    "--s-accent": theme.palette.accent,
    "--s-ink": theme.palette.ink,
    "--s-canvas-dark": darkPalette(theme.palette).canvas,
    "--s-ink-dark": darkPalette(theme.palette).ink,
  } as CSSProperties;
}

/** The theme's choices the stylesheet reads from the site's root. */
export function themeAttributes(theme: Theme, editing = false) {
  return {
    "data-scale": theme.headingScale,
    "data-card": theme.card,
    "data-image": theme.image,
    "data-eyebrow": theme.eyebrow,
    "data-motion": editing ? "none" : theme.motion,
    "data-emphasis": theme.emphasis,
    "data-tone": theme.photoTone,
  };
}

/** One colour scheme as the variables a section's contents read. */
export function schemeStyle(theme: Theme, scheme: SchemeId): CSSProperties {
  const colours = schemesOf(theme.palette)[scheme];
  // The school's own colour and its ink bands are already dark and keep
  // their colours on a dark screen.
  const band = scheme === "brand" || scheme === "ink";
  const bands = darkBands(theme.palette);
  const dark = band
    ? schemesOf({
        ...theme.palette,
        primary: bands.primary,
        ink: bands.ink,
      })[scheme]
    : schemesOf(darkPalette(theme.palette))[scheme];
  const edged = scheme === "brand" ? bands.edged.primary : bands.edged.ink;
  return {
    "--s-bg": colours.background,
    "--s-fg": colours.body,
    "--s-heading": colours.heading,
    "--s-muted": colours.muted,
    "--s-link": colours.link,
    "--s-border": colours.border,
    "--s-card": colours.card,
    "--s-btn": colours.button,
    "--s-btn-fg": colours.buttonText,
    "--s-bg-dark": dark.background,
    "--s-fg-dark": dark.body,
    "--s-heading-dark": dark.heading,
    "--s-muted-dark": dark.muted,
    "--s-link-dark": dark.link,
    "--s-border-dark": dark.border,
    "--s-card-dark": dark.card,
    "--s-btn-dark": dark.button,
    "--s-btn-fg-dark": dark.buttonText,
    ...(band && edged ? { "--s-edge-dark": dark.border } : {}),
  } as CSSProperties;
}

/** Words over a photograph or video read white on its darkened overlay. */
export const overMediaStyle = {
  // The art ramp's accent is lifted to read on a deep ground; the raw accent
  // (a crimson, a navy) can sit at 2:1 there, and Arabic emphasis is colour.
  "--s-em": "var(--s-art-accent)",
  "--s-fg": "#FFFFFF",
  "--s-heading": "#FFFFFF",
  "--s-muted": "rgba(255,255,255,0.82)",
  "--s-link": "#FFFFFF",
  "--s-border": "rgba(255,255,255,0.3)",
  "--s-card": "rgba(255,255,255,0.12)",
  "--s-btn": "#FFFFFF",
  "--s-btn-fg": "#111111",
} as CSSProperties;

/**
 * A picture's proportions as variables the stylesheet reads, so a phone can
 * take its own: a portrait that suits a column would fill a phone's screen.
 */
export function ratioStyle(ratio?: string, phoneRatio?: string): CSSProperties {
  return {
    ...(ratio ? { "--s-ratio": ratio } : {}),
    ...(phoneRatio ? { "--s-phone-ratio": phoneRatio } : {}),
  } as CSSProperties;
}

/** Keeps a picture's subject in view whatever the crop, and zooms in towards it. */
export function focusStyle(focus?: PictureFocus): CSSProperties | undefined {
  if (!focus) return undefined;
  const at = `${focus.x}% ${focus.y}%`;
  return { objectPosition: at, transformOrigin: at };
}

function channels(colour: string): [number, number, number] {
  const value = Number.parseInt(colour.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => channel / 255,
  ) as [number, number, number];
}

/**
 * The duotone as filter tables: shadows in the brand colour, highlights in
 * the page colour, so photographs from different phones read as one set.
 */
export function duotoneTables(theme: Theme) {
  const dark = channels(theme.palette.primary);
  const light = channels(theme.palette.canvas);
  return dark.map(
    (channel, index) =>
      `${channel.toFixed(3)} ${(light[index] ?? 1).toFixed(3)}`,
  ) as [string, string, string];
}
