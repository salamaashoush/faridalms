import { queryOptions } from "@tanstack/react-query";

import {
  getConsentForm,
  getConsentForms,
  getFamilyConsents,
  getStudentConsents,
} from "~/server/consents";

export const consentFormsQuery = queryOptions({
  queryKey: ["consents", "forms"],
  queryFn: () => getConsentForms(),
});

export const consentFormQuery = (purposeId: string) =>
  queryOptions({
    queryKey: ["consents", "form", purposeId],
    queryFn: () => getConsentForm({ data: { purposeId } }),
  });

export const studentConsentsQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["consents", "student", studentId],
    queryFn: () => getStudentConsents({ data: { id: studentId } }),
  });

export const familyConsentsQuery = queryOptions({
  queryKey: ["consents", "family"],
  queryFn: () => getFamilyConsents(),
});
