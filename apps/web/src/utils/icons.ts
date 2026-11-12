import type { StaticDataRouteOption } from "@tanstack/react-router";

import { publicMediaUrl } from "./host";

const PLATFORM_ICONS = [
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  {
    rel: "icon",
    type: "image/png",
    sizes: "32x32",
    href: "/favicon-32x32.png",
  },
  {
    rel: "icon",
    type: "image/png",
    sizes: "16x16",
    href: "/favicon-16x16.png",
  },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
];

/** The logo a school's face carries, as its website or a portal door loaded it. */
function logoIn(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if ("logoKey" in data)
    return typeof data.logoKey === "string" ? data.logoKey : null;
  return "face" in data ? logoIn(data.face) : null;
}

/**
 * Head links merge across routes rather than replace, and browsers differ
 * in which of several icons they take, so the root alone names the icon: a
 * school's logo on a page drawn in its face, the platform's anywhere else.
 */
export function iconsFor(
  matches: readonly {
    staticData: StaticDataRouteOption;
    loaderData?: unknown;
  }[],
) {
  const face = matches.findLast((match) => match.staticData.schoolFace);
  const logo = face ? logoIn(face.loaderData) : null;
  if (!logo) return PLATFORM_ICONS;
  const href = publicMediaUrl(logo);
  return [
    { rel: "icon", href },
    { rel: "apple-touch-icon", href },
  ];
}
