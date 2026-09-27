import type { StaffDirectoryQuery } from "@faridalms/domain/people";

import { queryOptions } from "@tanstack/react-query";

import { getStaff, getStaffMember } from "~/server/staff";

export const staffQuery = (query: StaffDirectoryQuery) =>
  queryOptions({
    queryKey: ["people", "staff", query],
    queryFn: () => getStaff({ data: query }),
  });

export const staffMemberQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "staff-member", id],
    queryFn: () => getStaffMember({ data: { id } }),
  });
