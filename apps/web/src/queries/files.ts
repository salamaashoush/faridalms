import type { FileArea } from "@faridalms/domain/file";

import { queryOptions } from "@tanstack/react-query";

import { getAreaFiles } from "~/server/files";

export const areaFilesQuery = (
  area: { type: FileArea; id: string },
  trashed: boolean,
) =>
  queryOptions({
    queryKey: ["files", "area", area.type, area.id, trashed],
    queryFn: () => getAreaFiles({ data: { area, trashed } }),
  });
