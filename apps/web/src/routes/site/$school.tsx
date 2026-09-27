import { SITE_LOCALES } from "@faridalms/domain/website";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import * as v from "valibot";

import { publicSiteQuery } from "~/queries/site";
import siteCss from "~/styles/site.css?url";

/** A school's public website. No one signs in here; the address names the school. */
export const Route = createFileRoute("/site/$school")({
  validateSearch: v.object({
    lang: v.fallback(v.optional(v.picklist(SITE_LOCALES)), undefined),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicSiteQuery(params.school, deps.lang),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.name }] : [],
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  component: Outlet,
});
