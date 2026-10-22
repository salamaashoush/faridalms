import type { CompilerOptions } from "@inlang/paraglide-js";

// Shared by vite.config.ts and scripts/compile-i18n.ts. The `paraglide-js compile`
// CLI has no --cookie-name flag, so a CLI-based compile would silently emit a
// runtime using the default PARAGLIDE_LOCALE cookie and diverge from the build.
export const paraglideOptions = {
  project: "./project.inlang",
  outdir: "./apps/web/src/i18n",
  outputStructure: "message-modules",
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
  // A lesson preview frame takes its language from its address alone
  // (apps/web/src/preview-locale.ts): with the cookie in its strategies, the
  // frame would write its language there and switch the teacher's page.
  routeStrategies: [
    {
      match: "/lesson-frame/:path(.*)?",
      strategy: ["custom-preview", "baseLocale"],
    },
  ],
  cookieName: "language-tag",
} satisfies CompilerOptions;
