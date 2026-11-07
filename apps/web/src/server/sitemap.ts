import { isHiddenRecordError } from "@faridalms/api-client";

import { backend } from "./backend";

/** The sitemap of a school's live website, or null where it has none. */
export async function siteMapOf(school: string) {
  try {
    return await backend(null).site.publicSitemap({ school });
  } catch (error) {
    if (isHiddenRecordError(error)) return null;
    throw error;
  }
}

export const textResponse = (
  body: string,
  type: "application/xml" | "text/plain",
  status = 200,
) =>
  new Response(body, {
    status,
    headers: {
      "content-type": `${type}; charset=utf-8`,
      "cache-control": status === 200 ? "public, max-age=900" : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
