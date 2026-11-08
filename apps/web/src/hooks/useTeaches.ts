import type { QueryClient } from "@tanstack/react-query";

import { useSuspenseQuery } from "@tanstack/react-query";

import { myClassesQuery } from "~/queries/classes";

/**
 * Whether the viewer teaches or assists in a class this working year. A
 * page with a personal and a school-wide side opens on the personal one for
 * whoever teaches, and leaves it out for an overseer who does not.
 */
export async function loadTeaches(queryClient: QueryClient): Promise<boolean> {
  const mine = await queryClient.ensureQueryData(myClassesQuery(""));
  return mine.rows.length > 0;
}

export function useTeaches(): boolean {
  return useSuspenseQuery(myClassesQuery("")).data.rows.length > 0;
}
