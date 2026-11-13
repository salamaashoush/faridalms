import type { Capability } from "@faridalms/domain/capabilities";
import type { ReactNode } from "react";

import { classDirectorySchema } from "@faridalms/domain/classes";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import type { ClassesSearch, ClassesTab } from "~/components/classes/slots";

import { ClassDirectory } from "~/components/classes/ClassDirectory";
import { MyClasses } from "~/components/classes/MyClasses";
import {
  classColumns,
  classesTabs,
  classFilters,
  viewsOf,
} from "~/components/classes/slots";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import {
  classDirectoryQuery,
  classOptionsQuery,
  myClassesQuery,
} from "~/queries/classes";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";

// Loose, so a module's view rides in the address under its own key.
const searchSchema = v.looseObject({
  ...classDirectorySchema.entries,
  scope: v.fallback(
    v.optional(v.pipe(v.string(), v.regex(/^[a-z]{1,20}$/))),
    undefined,
  ),
});
type Search = ClassesSearch & v.InferOutput<typeof searchSchema>;

const DEFAULT_SEARCH = v.parse(searchSchema, {});

/** The capabilities that open every class of the school, as the API's reach does. */
const SCHOOL_WIDE: readonly Capability[] = ["classes:manage", "people:manage"];

/**
 * Whose classes the page offers: the viewer's own when they teach, and for
 * whoever oversees the school the tabs modules add, then every class.
 */
function scopesOf(
  capabilities: readonly Capability[],
  teaches: boolean,
  tabs: readonly ClassesTab[],
): string[] {
  const all = SCHOOL_WIDE.some((capability) =>
    capabilities.includes(capability),
  );
  if (!all) return ["mine"];
  return [...(teaches ? ["mine"] : []), ...tabs.map((tab) => tab.value), "all"];
}

function scopeOf(search: Search, scopes: string[]): string {
  return search.scope && scopes.includes(search.scope)
    ? search.scope
    : (scopes[0] ?? "mine");
}

export const Route = createFileRoute("/_app/_staff/classes")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const filters = filled(context.extensions, user, classFilters);
    const views = viewsOf(filters, deps);
    const [mine] = await Promise.all([
      context.queryClient.ensureQueryData(myClassesQuery(views)),
      context.queryClient.ensureQueryData(classOptionsQuery),
      ...[...filters, ...filled(context.extensions, user, classColumns)].map(
        (part) => context.queryClient.ensureQueryData(part.query()),
      ),
    ]);
    const tabs = filled(context.extensions, user, classesTabs);
    const scopes = scopesOf(user.capabilities, mine.rows.length > 0, tabs);
    const scope = scopeOf(deps, scopes);
    const tab = tabs.find((row) => row.value === scope);
    if (tab) await tab.prefetch(context.queryClient, deps, views);
    else if (scope === "all")
      await context.queryClient.ensureQueryData(
        classDirectoryQuery({ ...deps, views }),
      );
  },
  component: ClassesPage,
});

function ClassesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const tabs = useSlot(classesTabs);
  const views = viewsOf(useSlot(classFilters), search);
  const mine = useSuspenseQuery(myClassesQuery(views)).data;
  const scopes = scopesOf(user.capabilities, mine.rows.length > 0, tabs);
  const scope = scopeOf(search, scopes);
  const labelOf = (value: string) =>
    value === "mine"
      ? m.teachMyClassesTitle()
      : value === "all"
        ? m.classesAllTab()
        : (tabs.find((tab) => tab.value === value)?.label() ?? "");
  const patch = (change: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  const frame = (content: ReactNode) =>
    scopes.length > 1 ? (
      <RecordTabs
        label={m.navClasses()}
        tabs={scopes.map((value) => ({ value, label: labelOf(value) }))}
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
  const title = scopes.length > 1 ? m.navClasses() : labelOf(scope);
  const tab = tabs.find((row) => row.value === scope);
  if (tab)
    return (
      <tab.Tab search={search} onSearch={patch} title={title} frame={frame} />
    );
  return scope === "all" ? (
    <ClassDirectory
      search={search}
      onSearch={patch}
      title={scopes.length > 1 ? title : m.adminClassesTitle()}
      frame={frame}
    />
  ) : (
    <MyClasses search={search} onSearch={patch} title={title} frame={frame} />
  );
}
