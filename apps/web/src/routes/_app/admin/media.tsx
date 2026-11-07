import { AREA_SORTS, FILE_KINDS } from "@faridalms/domain/file";
import { LIBRARY_USERS } from "@faridalms/domain/media-library";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import type { LibraryView } from "~/components/media/MediaLibrary";

import { LIBRARY_LAYOUTS, MediaLibrary } from "~/components/media/MediaLibrary";
import { libraryQuery } from "~/queries/media-library";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

const searchSchema = v.object({
  folder: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
  q: v.fallback(v.optional(v.pipe(v.string(), v.maxLength(100)), ""), ""),
  kinds: v.fallback(v.optional(v.array(v.picklist(FILE_KINDS)), []), []),
  sort: v.fallback(v.optional(v.picklist(AREA_SORTS), "added"), "added"),
  order: v.fallback(v.optional(v.picklist(["asc", "desc"]), "desc"), "desc"),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  layout: v.fallback(v.optional(v.picklist(LIBRARY_LAYOUTS), "grid"), "grid"),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admin/media")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, ...LIBRARY_USERS);
    await context.queryClient.ensureQueryData(
      libraryQuery({
        folderId: deps.folder || null,
        q: deps.q.trim(),
        kinds: deps.kinds,
        sort: deps.sort,
        order: deps.order,
        page: deps.page,
      }),
    );
  },
  component: MediaLibraryPage,
});

function MediaLibraryPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MediaLibrary
      view={search}
      onView={(change: Partial<LibraryView>) => {
        void navigate({
          resetScroll: false,
          search: (previous) => ({ ...previous, ...change }),
        });
      }}
    />
  );
}
