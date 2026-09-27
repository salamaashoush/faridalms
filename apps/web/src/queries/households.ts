import type { HouseholdsQuery } from "@faridalms/domain/people";

import { queryOptions } from "@tanstack/react-query";

import {
  getHousehold,
  getHouseholds,
  getHouseholdsOf,
} from "~/server/households";

export const householdsQuery = (query: HouseholdsQuery) =>
  queryOptions({
    queryKey: ["people", "households", query],
    queryFn: () => getHouseholds({ data: query }),
  });

export const householdQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "household", id],
    queryFn: () => getHousehold({ data: { id } }),
  });

export const householdsOfQuery = (userId: string) =>
  queryOptions({
    queryKey: ["people", "households-of", userId],
    queryFn: () => getHouseholdsOf({ data: { userId } }),
  });
