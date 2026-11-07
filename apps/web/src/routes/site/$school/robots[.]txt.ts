import { robotsTxt } from "@faridalms/domain/site-seo";
import { createFileRoute } from "@tanstack/react-router";

import { siteMapOf, textResponse } from "~/server/sitemap";
import { hostHref } from "~/utils/host";

/** What crawlers may read on the school's website host, and where its sitemap is. */
export const Route = createFileRoute("/site/$school/robots.txt")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const map = await siteMapOf(params.school);
        if (!map) return textResponse("Not found", "text/plain", 404);
        return textResponse(
          robotsTxt(hostHref(map.siteHost, "/sitemap.xml")),
          "text/plain",
        );
      },
    },
  },
});
