import {
  addEntrySchema,
  assignEnquirySchema,
  enquiryListSchema,
  enquiryRefSchema,
  logEnquirySchema,
  moveEnquirySchema,
  replySchema,
} from "@faridalms/domain/enquiries";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getEnquiries = createServerFn({ method: "GET" })
  .validator(checked(enquiryListSchema))
  .handler(({ data }) => backend().admissions.enquiries(data));

export const getEnquiry = createServerFn({ method: "GET" })
  .validator(checked(enquiryRefSchema))
  .handler(({ data }) => record(backend().admissions.enquiry(data)));

export const logEnquiry = createServerFn({ method: "POST" })
  .validator(checked(logEnquirySchema))
  .handler(({ data }) => backend().admissions.logEnquiry(data));

export const assignEnquiry = createServerFn({ method: "POST" })
  .validator(checked(assignEnquirySchema))
  .handler(({ data }) => backend().admissions.assignEnquiry(data));

export const moveEnquiry = createServerFn({ method: "POST" })
  .validator(checked(moveEnquirySchema))
  .handler(({ data }) => backend().admissions.moveEnquiry(data));

export const addEnquiryEntry = createServerFn({ method: "POST" })
  .validator(checked(addEntrySchema))
  .handler(({ data }) => backend().admissions.addEnquiryEntry(data));

export const replyToEnquiry = createServerFn({ method: "POST" })
  .validator(checked(replySchema))
  .handler(({ data }) => backend().admissions.replyToEnquiry(data));
