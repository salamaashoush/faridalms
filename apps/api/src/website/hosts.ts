import { pageTitles, postedLive } from "@faridalms/database/stores/site";

import type { LiveReviser } from "../core/shared";
import type { FileHost } from "../files/authorize";

/** The kinds of record this module keeps files and documents in, filled as its systems load. */
export const WEBSITE_HOSTS: FileHost[] = [
  {
    hostType: "site_page",
    titlesOf: (context, ids) => pageTitles(context.tx, context.tenantId, ids),
    liveOf: async (context, ids) =>
      new Set(
        [...(await pageTitles(context.tx, context.tenantId, ids))]
          .filter(([, page]) => page.live)
          .map(([id]) => id),
      ),
  },
  {
    hostType: "announcement",
    liveOf: (context, ids) => postedLive(context.tx, context.tenantId, ids),
  },
];

/** How the website's published pages follow a shared section that changed. */
export const WEBSITE_REVISERS: LiveReviser[] = [];
