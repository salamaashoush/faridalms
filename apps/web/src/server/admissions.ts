import {
  applicationListSchema,
  applicationNoteSchema,
  applicationRefSchema,
  attachDocumentSchema,
  detachDocumentSchema,
  formRefSchema,
  intakeListSchema,
  intakeRefSchema,
  moveApplicationSchema,
  moveItemSchema,
  registerFamilySchema,
  saveDraftSchema,
  saveFormSchema,
  saveIntakeSchema,
  startApplicationSchema,
  submitApplicationSchema,
  withdrawApplicationSchema,
} from "@faridalms/domain/admissions";
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
import { byId, checked } from "./input";

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

export const getIntakeOptions = createServerFn({ method: "GET" }).handler(() =>
  backend().intakes.options(),
);

export const getIntakes = createServerFn({ method: "GET" })
  .validator(checked(intakeListSchema))
  .handler(({ data }) => backend().intakes.list(data));

export const getIntake = createServerFn({ method: "GET" })
  .validator(checked(intakeRefSchema))
  .handler(({ data }) => record(backend().intakes.intake(data)));

export const saveIntake = createServerFn({ method: "POST" })
  .validator(checked(saveIntakeSchema))
  .handler(({ data }) => backend().intakes.saveIntake(data));

export const getForms = createServerFn({ method: "GET" }).handler(() =>
  backend().intakes.forms(),
);

export const getForm = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().intakes.form(data)));

export const saveForm = createServerFn({ method: "POST" })
  .validator(checked(saveFormSchema))
  .handler(({ data }) => backend().intakes.saveForm(data));

export const publishForm = createServerFn({ method: "POST" })
  .validator(checked(formRefSchema))
  .handler(({ data }) => backend().intakes.publishForm(data));

export const getApplications = createServerFn({ method: "GET" })
  .validator(checked(applicationListSchema))
  .handler(({ data }) => backend().applications.list(data));

export const getApplication = createServerFn({ method: "GET" })
  .validator(checked(applicationRefSchema))
  .handler(({ data }) => record(backend().applications.application(data)));

export const getApplicationNeeds = createServerFn({ method: "POST" })
  .validator(checked(applicationRefSchema))
  .handler(({ data }) => backend().applications.needs(data));

export const moveApplication = createServerFn({ method: "POST" })
  .validator(checked(moveApplicationSchema))
  .handler(({ data }) => backend().applications.move(data));

export const withdrawForFamily = createServerFn({ method: "POST" })
  .validator(checked(withdrawApplicationSchema))
  .handler(({ data }) => backend().applications.withdraw(data));

export const noteApplication = createServerFn({ method: "POST" })
  .validator(checked(applicationNoteSchema))
  .handler(({ data }) => backend().applications.note(data));

export const moveItem = createServerFn({ method: "POST" })
  .validator(checked(moveItemSchema))
  .handler(({ data }) => backend().applications.moveItem(data));

export const fileForFamily = createServerFn({ method: "POST" })
  .validator(checked(attachDocumentSchema))
  .handler(({ data }) => backend().applications.attach(data));

export const registerFamily = createServerFn({ method: "POST" })
  .validator(checked(registerFamilySchema))
  .handler(({ data }) => backend().applying.register(data));

export const getMyApplications = createServerFn({ method: "GET" }).handler(() =>
  backend().applying.mine(),
);

export const startApplication = createServerFn({ method: "POST" })
  .validator(checked(startApplicationSchema))
  .handler(({ data }) => backend().applying.start(data));

export const getDraft = createServerFn({ method: "GET" })
  .validator(checked(applicationRefSchema))
  .handler(({ data }) => record(backend().applying.draft(data)));

export const saveDraft = createServerFn({ method: "POST" })
  .validator(checked(saveDraftSchema))
  .handler(({ data }) => backend().applying.save(data));

export const submitApplication = createServerFn({ method: "POST" })
  .validator(checked(submitApplicationSchema))
  .handler(({ data }) => backend().applying.submit(data));

export const withdrawApplication = createServerFn({ method: "POST" })
  .validator(checked(withdrawApplicationSchema))
  .handler(({ data }) => backend().applying.withdraw(data));

export const attachDocument = createServerFn({ method: "POST" })
  .validator(checked(attachDocumentSchema))
  .handler(({ data }) => backend().applying.attach(data));

export const detachDocument = createServerFn({ method: "POST" })
  .validator(checked(detachDocumentSchema))
  .handler(({ data }) => backend().applying.detach(data));
