import { queryOptions } from "@tanstack/react-query";

import {
  getChildren,
  getCustody,
  getGuardianNotices,
  getGuardians,
  getRelations,
  getSiblings,
  getWithoutGuardian,
} from "~/server/families";

export type Relations = Awaited<ReturnType<typeof getRelations>>;
export type Guardians = Awaited<ReturnType<typeof getGuardians>>;

export const relationsQuery = {
  queryKey: ["families", "relations"],
  queryFn: () => getRelations(),
};

export const guardiansQuery = (studentId: string) => ({
  queryKey: ["people", "student", studentId, "guardians"],
  queryFn: () => getGuardians({ data: { studentId } }),
});

export const siblingsQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "siblings", id],
    queryFn: () => getSiblings({ data: { id } }),
  });

export const guardianNoticesQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "student", id, "notices"],
    queryFn: () => getGuardianNotices({ data: { id } }),
  });

/** The learners a person is linked to; the viewer's own for the family workspace. */
export const childrenQuery = (userId: string) =>
  queryOptions({
    queryKey: ["families", "children", userId],
    queryFn: () => getChildren({ data: { userId } }),
  });

export const custodyQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "custody"],
    queryFn: () => getCustody({ data: { studentId } }),
  });

export const withoutGuardianQuery = {
  queryKey: ["families", "without-guardian"],
  queryFn: () => getWithoutGuardian(),
};
