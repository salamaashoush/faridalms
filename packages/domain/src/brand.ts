import * as v from "valibot";

import { contrast, mix } from "./site-theme";

/** WCAG AA for body text: the least contrast the school's sign-in may show words at. */
export const READABLE = 4.5;

/** A colour as a school chooses it: six hex digits, kept in capitals. */
export const brandColourSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^#[0-9A-Fa-f]{6}$/, "school.brand_colour"),
  v.toUpperCase(),
);

/** The words on the band of the brand colour: white where it reads, else near black. */
export function bandText(brand: string): string {
  return contrast("#FFFFFF", brand) >= READABLE ? "#FFFFFF" : "#111111";
}

function channels(colour: string): [number, number, number] {
  const value = Number.parseInt(colour.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * The faintest words the band shows, its notes at three quarters of the
 * text's strength laid over the brand colour, as the browser blends them.
 */
export function faintBandText(brand: string): string {
  const text = channels(bandText(brand));
  const ground = channels(brand);
  return `#${text
    .map((channel, index) =>
      Math.round(channel * 0.75 + (ground[index] ?? 0) * 0.25)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/** The contrast of the band's faintest words on the brand colour. */
export function bandContrast(brand: string): number {
  return contrast(faintBandText(brand), brand);
}

/** Whether every word on the band of this colour meets WCAG AA. */
export function brandReadable(brand: string): boolean {
  return bandContrast(brand) >= READABLE;
}

/**
 * The shade of the colour nearest to it whose band reads, darker or
 * lighter, for a school whose own choice does not: the colour itself where
 * it already reads.
 */
export function readableBrand(brand: string): string {
  if (brandReadable(brand)) return brand;
  for (let step = 1; step <= 20; step += 1) {
    const amount = step / 20;
    for (const towards of ["#000000", "#FFFFFF"]) {
      const shade = mix(brand, towards, amount).toUpperCase();
      if (brandReadable(shade)) return shade;
    }
  }
  return "#000000";
}

/**
 * The colour a school's sign-in pages take: its brand colour where it set
 * one, else the colour a module lends (its website's), in the nearest shade
 * that reads, since nobody chose it for the sign-in; null for the
 * platform's.
 */
export function portalColour(
  brand: string | null,
  lent: string | null,
): string | null {
  if (brand) return brand;
  return lent ? readableBrand(lent.toUpperCase()) : null;
}
