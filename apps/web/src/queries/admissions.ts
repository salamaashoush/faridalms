import type { ApplicationListQuery } from "@faridalms/domain/admissions";
import type { EnquiryListQuery } from "@faridalms/domain/enquiries";

import { queryOptions } from "@tanstack/react-query";

import {
  getApplication,
  getApplications,
  getDraft,
  getEnquiries,
  getEnquiry,
  getForm,
  getForms,
  getIntake,
  getIntakeOptions,
  getIntakes,
  getMyApplications,
} from "~/server/admissions";

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

export const intakeOptionsQuery = queryOptions({
  queryKey: ["admissions", "intake-options"],
  queryFn: () => getIntakeOptions(),
});

export const intakesQuery = (year: string) =>
  queryOptions({
    queryKey: ["admissions", "intakes", year],
    queryFn: () => getIntakes({ data: { year } }),
  });

export const intakeQuery = (id: string) =>
  queryOptions({
    queryKey: ["admissions", "intake", id],
    queryFn: () => getIntake({ data: { id } }),
  });

export const formsQuery = queryOptions({
  queryKey: ["admissions", "forms"],
  queryFn: () => getForms(),
});

export const formQuery = (id: string) =>
  queryOptions({
    queryKey: ["admissions", "form", id],
    queryFn: () => getForm({ data: { id } }),
  });

export const applicationsQuery = (query: ApplicationListQuery) =>
  queryOptions({
    queryKey: ["admissions", "applications", query],
    queryFn: () => getApplications({ data: query }),
  });

export const applicationQuery = (id: string) =>
  queryOptions({
    queryKey: ["admissions", "application", id],
    queryFn: () => getApplication({ data: { id } }),
  });

export const myApplicationsQuery = queryOptions({
  queryKey: ["applying", "mine"],
  queryFn: () => getMyApplications(),
});

export const draftQuery = (id: string) =>
  queryOptions({
    queryKey: ["applying", "draft", id],
    queryFn: () => getDraft({ data: { id } }),
  });
