import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { useSuspenseQueries } from "@tanstack/react-query";

import { useSlot } from "~/hooks/useSlot";

import type { ClassesSearch } from "./slots";

import { classFilters } from "./slots";

/** The facets the modules on add to a list of classes, each kept in the address under its key. */
export function useClassFacets(
  search: ClassesSearch,
  onSearch: (change: Partial<ClassesSearch>) => void,
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
      (next) => onSearch({ [filter.key]: next }),
    );
    return facet ? [facet] : [];
  });
}
