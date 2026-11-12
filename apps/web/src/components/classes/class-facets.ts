import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { useSuspenseQueries } from "@tanstack/react-query";

import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";

import type { ClassesSearch } from "./slots";

import { classFilters } from "./slots";

/**
 * The facets the modules on add to any list read through classes, each a
 * view kept in the address under its key.
 */
export function useViewFacets(
  search: Readonly<Record<string, unknown>>,
  onView: (key: string, value: string | undefined) => void,
): Facet[] {
  const filters = useSlot(classFilters);
  const reads = useSuspenseQueries({
    queries: filters.map((filter) => filter.query()),
  });
  return filters.flatMap((filter, index) => {
    const value = search[filter.key];
    const facet = filter.facetOf(
      reads[index]?.data,
      typeof value === "string" && value ? value : undefined,
      (next) => onView(filter.key, next),
    );
    return facet ? [facet] : [];
  });
}

/** The facets the modules on add to a list of classes, each kept in the address under its key. */
export function useClassFacets(
  search: ClassesSearch,
  onSearch: (change: Partial<ClassesSearch>) => void,
): Facet[] {
  return useViewFacets(search, (key, value) => onSearch({ [key]: value }));
}

/** Whether a module's view in the address names the classes listed, rather than leaving every class. */
export function useNarrowed(search: Readonly<Record<string, unknown>>) {
  return useSlot(classFilters).some((filter) => {
    const value = search[filter.key];
    return filter.narrows(typeof value === "string" ? value : undefined);
  });
}

/**
 * The facet for classes that ended, which a list without a module's view
 * shows in place of those still running or yet to start.
 */
export function endedFacet(
  ended: boolean,
  onChange: (ended: boolean) => void,
): Facet {
  return {
    id: "ended",
    label: m.classesWhen(),
    single: true,
    options: [
      { value: "", label: m.classesRunning() },
      { value: "ended", label: m.classesEnded() },
    ],
    selected: [ended ? "ended" : ""],
    defaultSelected: [""],
    onChange: ([next = ""]) => onChange(next === "ended"),
  };
}
