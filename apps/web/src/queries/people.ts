import { queryOptions } from "@tanstack/react-query";
import { isNotFound } from "@tanstack/react-router";

import { getPerson } from "~/server/people";

/**
 * Someone a link addresses a new message to, or null when the viewer cannot
 * reach them: a removed guardian, or a student no longer in the teacher's
 * class. Either way the composer opens unaddressed instead of the page 404ing.
 */
export const recipientQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", id, "recipient"],
    queryFn: async () => {
      try {
        return (await getPerson({ data: { id } })).profile;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
  });
