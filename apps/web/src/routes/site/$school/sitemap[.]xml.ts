import { sitemapXml } from "@faridalms/domain/site-seo";
import { createFileRoute } from "@tanstack/react-router";

import { siteMapOf, textResponse } from "~/server/sitemap";
import { hostHref } from "~/utils/host";

/**
 * The website's published pages and posts for search engines, at
 * `/sitemap.xml` on the school's website host.
 */
export const Route = createFileRoute("/site/$school/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const map = await siteMapOf(params.school);
        if (!map) return textResponse("Not found", "text/plain", 404);
        return textResponse(
          sitemapXml(map.entries, map.primaryLocale, (path) =>
            hostHref(map.siteHost, path),
          ),
          "application/xml",
        );
      },
    },
  },
});
