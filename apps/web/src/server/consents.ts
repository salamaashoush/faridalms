import {
  answerConsentSchema,
  consentFormRefSchema,
  consentFormSchema,
  recordConsentSchema,
  reviewConsentFormSchema,
  saveConsentFormSchema,
} from "@faridalms/domain/consents";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getConsentForms = createServerFn({ method: "GET" }).handler(() =>
  backend().consents.forms(),
);

export const getConsentForm = createServerFn({ method: "GET" })
  .validator(checked(consentFormSchema))
  .handler(({ data }) => record(backend().consents.form(data)));

export const saveConsentForm = createServerFn({ method: "POST" })
  .validator(checked(saveConsentFormSchema))
  .handler(({ data }) => backend().consents.saveForm(data));

export const reviewConsentForm = createServerFn({ method: "POST" })
  .validator(checked(reviewConsentFormSchema))
  .handler(({ data }) => backend().consents.reviewForm(data));

export const publishConsentForm = createServerFn({ method: "POST" })
  .validator(checked(consentFormRefSchema))
  .handler(({ data }) => backend().consents.publishForm(data));

export const discardConsentForm = createServerFn({ method: "POST" })
  .validator(checked(consentFormRefSchema))
  .handler(({ data }) => backend().consents.discardForm(data));

export const getStudentConsents = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().consents.student(data)));

export const recordConsent = createServerFn({ method: "POST" })
  .validator(checked(recordConsentSchema))
  .handler(({ data }) => backend().consents.record(data));

export const getMyConsents = createServerFn({ method: "GET" }).handler(() =>
  backend().consents.mine(),
);

export const answerConsent = createServerFn({ method: "POST" })
  .validator(checked(answerConsentSchema))
  .handler(({ data }) => backend().consents.answer(data));
