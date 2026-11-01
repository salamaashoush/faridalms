import type { ApplicationListQuery } from "@faridalms/domain/admissions";
import type { EnquiryListQuery } from "@faridalms/domain/enquiries";

import { queryOptions } from "@tanstack/react-query";

import {
  getAdmissionReports,
  getApplication,
  getApplications,
  getAttendees,
  getBoard,
  getDraft,
  getEnquiries,
  getEnquiry,
  getFamilyLetter,
  getForm,
  getForms,
  getIntake,
  getIntakeOptions,
  getIntakes,
  getMyApplications,
  getOfficeLetter,
} from "~/server/admissions";
import { listTemplates } from "~/server/templates";

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

export const boardQuery = (intake: string) =>
  queryOptions({
    queryKey: ["admissions", "board", intake],
    queryFn: () => getBoard({ data: { intake } }),
  });

export const admissionReportsQuery = (year: string) =>
  queryOptions({
    queryKey: ["admissions", "reports", year],
    queryFn: () => getAdmissionReports({ data: { year } }),
  });

export const attendeesQuery = queryOptions({
  queryKey: ["admissions", "attendees"],
  queryFn: () => getAttendees(),
});

/** A letter as the office reads it, or as the family it was sent to does. */
export const letterQuery = (id: string, reader: "office" | "family") =>
  queryOptions({
    queryKey: [reader === "office" ? "admissions" : "applying", "letter", id],
    queryFn: () =>
      reader === "office"
        ? getOfficeLetter({ data: { id } })
        : getFamilyLetter({ data: { id } }),
  });

/** The school's letters of admission, one for each phase in each language. */
export const lettersQuery = queryOptions({
  queryKey: ["templates", "admission_letter"],
  queryFn: () => listTemplates({ data: { kind: "admission_letter" } }),
});
