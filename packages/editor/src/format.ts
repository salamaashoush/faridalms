export function formatBytes(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    // Short forms read "1.2 MB" but "45 byte", so bytes are spelled out.
    unitDisplay: unit === 0 ? "long" : "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

export function createBlockId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

export const imageSizeClass = {
  small: "w-full sm:w-1/3",
  medium: "w-full sm:w-1/2",
  large: "w-full sm:w-3/4",
  full: "w-full",
} as const;

/**
 * Where a block narrower than the column sits. The sides follow the reading
 * direction, so a picture set to the start stays at the start in Arabic.
 */
export function blockAlignClass(format: string | number | undefined): string {
  if (format === "start" || format === "left") return "me-auto";
  if (format === "end" || format === "right") return "ms-auto";
  return "mx-auto";
}

/**
 * A drawing is dark ink on a light or clear ground. The dark theme inverts it
 * the way the drawing board shows it, and blending drops whatever ground it
 * was saved with, so it sits on the page instead of on a card.
 */
export const diagramImageClass =
  "block h-auto w-full mix-blend-darken dark:mix-blend-lighten dark:[filter:invert(93%)_hue-rotate(180deg)]";
