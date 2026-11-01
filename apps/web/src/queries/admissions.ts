import type { EnquiryListQuery } from "@faridalms/domain/enquiries";

import { queryOptions } from "@tanstack/react-query";

import { getEnquiries, getEnquiry } from "~/server/admissions";

export const enquiriesQuery = (query: EnquiryListQuery) =>
  queryOptions({
    queryKey: ["admissions", "enquiries", query],
    queryFn: () => getEnquiries({ data: query }),
  });

export const enquiryQuery = (id: string) =>
  queryOptions({
    queryKey: ["admissions", "enquiry", id],
    queryFn: () => getEnquiry({ data: { id } }),
  });
