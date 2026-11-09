import { AREA_SORTS, FILE_KINDS } from "@faridalms/domain/file";
import { MEDIA_MONTH, MEDIA_USERS } from "@faridalms/domain/media";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import type { MediaPageView } from "~/components/media/MediaBrowser";

import {
  MEDIA_LAYOUTS,
  MEDIA_SOURCES,
  MediaBrowser,
} from "~/components/media/MediaBrowser";
import * as m from "~/i18n/messages";
import { mediaQuery } from "~/queries/media";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

const ids = v.fallback(
  v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(50)),
    [],
  ),
  [],
);

const searchSchema = v.object({
  source: v.fallback(v.optional(v.picklist(MEDIA_SOURCES), "kept"), "kept"),
  folder: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
  q: v.fallback(v.optional(v.pipe(v.string(), v.maxLength(100)), ""), ""),
  kinds: v.fallback(v.optional(v.array(v.picklist(FILE_KINDS)), []), []),
  months: v.fallback(
    v.optional(
      v.pipe(
        v.array(v.pipe(v.string(), v.regex(MEDIA_MONTH))),
        v.maxLength(24),
      ),
      [],
    ),
    [],
  ),
  uploaders: ids,
  tags: ids,
  sort: v.fallback(v.optional(v.picklist(AREA_SORTS), "added"), "added"),
  order: v.fallback(v.optional(v.picklist(["asc", "desc"]), "desc"), "desc"),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  layout: v.fallback(v.optional(v.picklist(MEDIA_LAYOUTS), "grid"), "grid"),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/_staff/media")({
  staticData: { breadcrumb: m.navMedia },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, ...MEDIA_USERS);
    await context.queryClient.ensureQueryData(
      mediaQuery({
        folderId: deps.folder || null,
        q: deps.q.trim(),
        kinds: deps.kinds,
        months: deps.months,
        uploaders: deps.uploaders,
        tags: deps.tags,
        sort: deps.sort,
        order: deps.order,
        page: deps.page,
      }),
    );
  },
  component: MediaPage,
});

function MediaPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MediaBrowser
      view={search}
      onView={(change: Partial<MediaPageView>) => {
        void navigate({
          resetScroll: false,
          search: (previous) => ({ ...previous, ...change }),
        });
      }}
    />
  );
}
