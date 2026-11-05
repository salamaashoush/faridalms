import type { AreaQuery, FileArea } from "@faridalms/domain/file";

import { queryOptions } from "@tanstack/react-query";

import { getAreaFiles, getPictured } from "~/server/files";

export const areaFilesQuery = (
  area: { type: FileArea; id: string },
  trashed: boolean,
  view: Omit<AreaQuery, "area" | "trashed"> = {},
) =>
  queryOptions({
    queryKey: ["files", "area", area.type, area.id, trashed, view],
    queryFn: () => getAreaFiles({ data: { area, trashed, ...view } }),
    placeholderData: (previous) => previous,
  });

export const picturedQuery = (ids: readonly string[]) =>
  queryOptions({
    queryKey: ["files", "pictured", [...ids].toSorted()],
    queryFn: () => getPictured({ data: { ids: [...ids] } }),
    enabled: ids.length > 0,
  });
