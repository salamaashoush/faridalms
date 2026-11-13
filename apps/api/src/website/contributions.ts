import {
  keepPublishedPicture,
  sitePublished,
  siteSettings,
} from "@faridalms/database/stores/site";
import { keepSiteClassPicture } from "@faridalms/database/stores/site-classes";
import { resolveTheme, siteThemeSchema } from "@faridalms/domain/site-theme";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { portalLooks } from "../core/portal-face";
import { setupMeasures } from "../core/setup";
import { pictureCopies } from "../core/site";

/** What the website gives the school: its setup step, its way and its colour on the portal, and its copies' pictures. */
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
      look: async (scope) => {
        const settings = await siteSettings(
          scope.tx,
          scope.tenantId,
          scope.schoolId,
        );
        if (!settings) return { live: false, colour: null };
        const theme = v.safeParse(siteThemeSchema, settings.theme);
        return {
          live: settings.live,
          colour: resolveTheme(theme.success ? theme.output : null).palette
            .primary,
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
    contribute(pictureCopies, {
      hostType: "site_class",
      keep: keepSiteClassPicture,
    }),
  ],
};
