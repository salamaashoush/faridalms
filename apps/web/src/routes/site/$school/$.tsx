import { createFileRoute } from "@tanstack/react-router";

import { followRedirect } from "~/components/site/redirect";
import { sitePathOut } from "~/utils/host";

/**
 * Any other address on a school's website: one the school redirected from
 * an earlier site, or not found.
 */
export const Route = createFileRoute("/site/$school/$")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ params, deps, location }) =>
    followRedirect(
      params.school,
      sitePathOut(location.pathname, params.school),
      deps.lang,
    ),
});
