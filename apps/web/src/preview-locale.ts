import type { Locale } from "~/i18n/runtime";

import {
  defineCustomClientStrategy,
  defineCustomServerStrategy,
  locales,
} from "~/i18n/runtime";

/** The page a teacher previews a lesson in, as a student would meet it. */
export const LESSON_FRAME = "/lesson-frame/";

/**
 * A preview frame shows a lesson in the language its `ui` asks for, whatever
 * the teacher's own, so they see it as a student who reads the other one
 * would. Everywhere else this strategy says nothing and the cookie decides.
 */
function frameLocale(url: URL): Locale | undefined {
  if (!url.pathname.startsWith(LESSON_FRAME)) return undefined;
  const asked = url.searchParams.get("ui");
  return locales.find((locale) => locale === asked);
}

defineCustomServerStrategy("custom-preview", {
  getLocale: (request) =>
    request ? frameLocale(new URL(request.url)) : undefined,
});

defineCustomClientStrategy("custom-preview", {
  getLocale: () =>
    typeof window === "undefined"
      ? undefined
      : frameLocale(new URL(window.location.href)),
  // The frame's language comes from its address alone; choosing one is
  // left to the strategies after this.
  setLocale: () => undefined,
});
