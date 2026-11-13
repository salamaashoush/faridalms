import { queryOptions } from "@tanstack/react-query";

import { getEmergencyContacts } from "~/server/emergency-contacts";

export const emergencyContactsQuery = (personId: string) =>
  queryOptions({
    queryKey: ["people", "emergency-contacts", personId],
    queryFn: () => getEmergencyContacts({ data: { personId } }),
  });
