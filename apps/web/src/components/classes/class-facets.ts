import type { Column } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { useSuspenseQueries } from "@tanstack/react-query";

import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";

import type { ClassesSearch, ViewValue } from "./slots";

import { classColumns, classFilters, viewValue } from "./slots";

/**
 * The facets the modules on add to any list read through classes, each a
 * view kept in the address under its key.
 */
export function useViewFacets(
  search: Readonly<Record<string, unknown>>,
  onView: (key: string, value: ViewValue) => void,
  directory = false,
): Facet[] {
  const filters = useSlot(classFilters).filter(
    (filter) => directory || !filter.directoryOnly,
  );
  const reads = useSuspenseQueries({
    queries: filters.map((filter) => filter.query()),
  });
  return filters.flatMap((filter, index) => {
    const facet = filter.facetOf(
      reads[index]?.data,
      viewValue(search[filter.key]),
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
  return useViewFacets(
    search,
    (key, value) => onSearch({ [key]: value }),
    true,
  );
}

/** Whether a module's view in the address names the classes listed, rather than leaving every class. */
export function useNarrowed(search: Readonly<Record<string, unknown>>) {
  return useSlot(classFilters).some((filter) =>
    filter.narrows(viewValue(search[filter.key])),
  );
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

/**
 * The columns the modules on add to a list of classes, each reading its
 * values from the list's `columns` under the module's key.
 */
export function useClassColumns<Row extends { id: string }>(
  values: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Column<Row>[] {
  const columns = useSlot(classColumns);
  const reads = useSuspenseQueries({
    queries: columns.map((column) => column.query()),
  });
  return columns.map((column, index) => ({
    id: column.key,
    header: column.header(),
    cell: (row: Row) =>
      column.cell(reads[index]?.data, values[column.key]?.[row.id] ?? null),
  }));
}
