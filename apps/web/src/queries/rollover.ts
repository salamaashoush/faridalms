import type { RolloverQuery } from "@faridalms/domain/rollover";

import { queryOptions } from "@tanstack/react-query";

import { getAsking, getRollover } from "~/server/rollover";

export const rolloverQuery = (query: RolloverQuery) =>
  queryOptions({
    queryKey: ["years", "rollover", query],
    queryFn: () => getRollover({ data: query }),
  });

export const askingQuery = {
  queryKey: ["years", "asking"],
  queryFn: () => getAsking(),
};
