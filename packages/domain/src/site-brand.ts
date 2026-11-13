import type { SiteTheme, Theme } from "./site-theme";

import { defaultTheme, resolveTheme } from "./site-theme";

/**
 * The website's look: its theme, whose main colour follows the school's
 * brand colour unless the builder set one for the public site alone.
 */
export function siteThemeFor(
  choice: SiteTheme | null | undefined,
  brand: string | null,
): Theme {
  if (!brand) return resolveTheme(choice);
  const chosen = choice ?? defaultTheme();
  return resolveTheme(
    chosen.palette.primary
      ? chosen
      : { ...chosen, palette: { ...chosen.palette, primary: brand } },
  );
}
