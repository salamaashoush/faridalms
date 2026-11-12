import {
  keepPublishedPicture,
  sitePublished,
  siteSettings,
} from "@faridalms/database/stores/site";
import { resolveTheme, siteThemeSchema } from "@faridalms/domain/site-theme";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { portalLooks } from "../core/portal-face";
import { setupMeasures } from "../core/setup";
import { pictureCopies } from "../core/site";

/** What the website gives the school: its setup step, its colours on the portal, and its copies' pictures. */
export const WEBSITE: ModuleContributions = {
  module: "website",
  contributions: [
    contribute(setupMeasures, {
      item: "website_published",
      seen: (scope) =>
        sitePublished(scope.tx, {
          tenantId: scope.tenantId,
          orgId: scope.schoolId,
        }),
    }),
    contribute(portalLooks, {
      look: async (unit) => {
        const settings = await siteSettings(
          unit.tx,
          unit.tenantId,
          unit.schoolId,
        );
        if (!settings) return { palette: null, live: false };
        const theme = v.safeParse(siteThemeSchema, settings.theme);
        return {
          palette: resolveTheme(theme.success ? theme.output : null).palette,
          live: settings.live,
        };
      },
    }),
    contribute(pictureCopies, {
      hostType: "site_page",
      keep: (tx, input) => keepPublishedPicture(tx, { ...input, host: "page" }),
    }),
    contribute(pictureCopies, {
      hostType: "announcement",
      keep: (tx, input) => keepPublishedPicture(tx, { ...input, host: "post" }),
    }),
  ],
};
