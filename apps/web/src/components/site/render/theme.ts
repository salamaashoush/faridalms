import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { SchemeId, Theme } from "@faridalms/domain/site-theme";
import type { CSSProperties } from "react";

import { FONTS, schemesOf } from "@faridalms/domain/site-theme";

const SPACE = { compact: "3.5rem", regular: "5rem", airy: "7rem" } as const;

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
  return {
    "--s-font-heading": heading,
    "--s-font-body": body,
    "--s-radius": `${theme.radius}px`,
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
    "--s-canvas": theme.palette.canvas,
    "--s-surface": theme.palette.surface,
    "--s-primary": theme.palette.primary,
    "--s-accent": theme.palette.accent,
    "--s-ink": theme.palette.ink,
  } as CSSProperties;
}

/** One colour scheme as the variables a section's contents read. */
export function schemeStyle(theme: Theme, scheme: SchemeId): CSSProperties {
  const colours = schemesOf(theme.palette)[scheme];
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
  } as CSSProperties;
}

/** Words over a photograph or video read white on its darkened overlay. */
export const overMediaStyle = {
  "--s-fg": "#FFFFFF",
  "--s-heading": "#FFFFFF",
  "--s-muted": "rgba(255,255,255,0.82)",
  "--s-link": "#FFFFFF",
  "--s-border": "rgba(255,255,255,0.3)",
  "--s-card": "rgba(255,255,255,0.12)",
  "--s-btn": "#FFFFFF",
  "--s-btn-fg": "#111111",
} as CSSProperties;
