import type { Capability } from "@faridalms/domain/capabilities";
import type { ReactNode } from "react";

import { classDirectorySchema } from "@faridalms/domain/classes";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import { ClassDirectory } from "~/components/classes/ClassDirectory";
import { MyClasses } from "~/components/classes/MyClasses";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  classDirectoryQuery,
  classOptionsQuery,
  myClassesQuery,
} from "~/queries/classes";
import { currentUserQuery } from "~/queries/user";

const SCOPES = ["mine", "all"] as const;
type Scope = (typeof SCOPES)[number];

const searchSchema = v.object({
  ...classDirectorySchema.entries,
  scope: v.fallback(v.optional(v.picklist(SCOPES)), undefined),
});
type Search = v.InferOutput<typeof searchSchema>;

const DEFAULT_SEARCH = v.parse(searchSchema, {});

/** The capabilities that open every class of the school, as the API's reach does. */
const SCHOOL_WIDE: readonly Capability[] = ["classes:manage", "people:manage"];

/**
 * Whose classes the page offers: the viewer's own when they teach, the
 * school's when they oversee it, and both as tabs to whoever does both.
 */
function scopesOf(
  capabilities: readonly Capability[],
  teaches: boolean,
): Scope[] {
  const all = SCHOOL_WIDE.some((capability) =>
    capabilities.includes(capability),
  );
  if (!all) return ["mine"];
  return teaches ? ["mine", "all"] : ["all"];
}

function scopeOf(search: Search, scopes: Scope[]): Scope {
  return search.scope && scopes.includes(search.scope)
    ? search.scope
    : (scopes[0] ?? "mine");
}

export const Route = createFileRoute("/_app/_staff/classes")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const [user, mine] = await Promise.all([
      context.queryClient.ensureQueryData(currentUserQuery),
      context.queryClient.ensureQueryData(myClassesQuery(deps.year)),
      context.queryClient.ensureQueryData(classOptionsQuery),
    ]);
    const scope = scopeOf(
      deps,
      scopesOf(user.capabilities, mine.rows.length > 0),
    );
    if (scope === "all")
      await context.queryClient.ensureQueryData(classDirectoryQuery(deps));
  },
  component: ClassesPage,
});

const SCOPE_LABEL: Record<Scope, () => string> = {
  mine: m.teachMyClassesTitle,
  all: m.classesAllTab,
};

function ClassesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const mine = useSuspenseQuery(myClassesQuery(search.year)).data;
  const scopes = scopesOf(user.capabilities, mine.rows.length > 0);
  const scope = scopeOf(search, scopes);
  const patch = (change: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  const frame = (content: ReactNode) =>
    scopes.length > 1 ? (
      <RecordTabs
        label={m.navClasses()}
        tabs={scopes.map((value) => ({
          value,
          label: SCOPE_LABEL[value](),
        }))}
        value={scope}
        onChange={(next) =>
          void navigate({
            resetScroll: false,
            replace: true,
            search: (previous) => ({ ...previous, scope: next }),
          })
        }
      >
        {content}
      </RecordTabs>
    ) : (
      content
    );
  const title = scopes.length > 1 ? m.navClasses() : SCOPE_LABEL[scope]();
  return scope === "all" ? (
    <ClassDirectory
      search={search}
      onSearch={patch}
      title={scopes.length > 1 ? title : m.adminClassesTitle()}
      frame={frame}
    />
  ) : (
    <MyClasses year={search.year} title={title} frame={frame} />
  );
}
