import type { FileArea } from "@faridalms/domain/file";

import { queryOptions } from "@tanstack/react-query";

import { getAreaFiles, getPictured } from "~/server/files";

export const areaFilesQuery = (
  area: { type: FileArea; id: string },
  trashed: boolean,
) =>
  queryOptions({
    queryKey: ["files", "area", area.type, area.id, trashed],
    queryFn: () => getAreaFiles({ data: { area, trashed } }),
  });

export const picturedQuery = (ids: readonly string[]) =>
  queryOptions({
    queryKey: ["files", "pictured", [...ids].toSorted()],
    queryFn: () => getPictured({ data: { ids: [...ids] } }),
    enabled: ids.length > 0,
  });
