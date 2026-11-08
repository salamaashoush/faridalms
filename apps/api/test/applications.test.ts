import { formDocument } from "@faridalms/domain/questions";
import { describe, expect, test } from "bun:test";

import { createTurnstile } from "../src/core/turnstile";
import {
  child,
  consents,
  filledDraft,
  intakeFor,
  names,
  officer,
  principal,
  QUESTION,
  registeredFamily,
  routeForm,
  routeQuestion,
  registrationLink,
} from "./admission-fixtures";
import {
  client,
  handlerWith,
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

describe("setting up admissions", () => {
  test("a teacher sets up nothing, and an intake needs a published form", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.intakes.options())).toMatchObject({
      code: "FORBIDDEN",
    });
    const api = await officer();
    const options = await api.intakes.options();
    const year = options.years.find((row) => row.titleEn === "2027–2028");
    const grade = options.grades.find((row) => row.labelEn === "Grade 5");
    if (!year || !grade) throw new Error("seed is missing next year");
    expect(year.cutoffOn).toBe("2027-10-01");
    expect(grade.minMonths).toBe(120);
    const draft = await api.intakes.saveForm({
      expectedVersion: 0,
      nameEn: "Unpublished",
      nameAr: "",
      primaryLocale: "en",
      body: formDocument([]),
      translation: null,
    });
    expect(
      await rejection(
        api.intakes.saveIntake({
          expectedVersion: 0,
          schoolYearId: year.id,
          gradeId: grade.id,
          opensOn: "2026-11-01",
          closesOn: "2027-03-31",
          capacity: 10,
          formId: draft.id,
          checklist: [],
          currency: "EGP",
          fees: [],
          decisionsOn: "",
          offerDays: 14,
          ageCutoffOn: "2027-10-01",
          minAgeMonths: null,
          maxAgeMonths: null,
          priorities: [],
        }),
      ),
    ).toMatchObject({ message: "intake.form_unpublished" });
  });

  test("a form is published only once each question is finished, in either language", async () => {
    const api = await officer();
    const form = await api.intakes.saveForm({
      expectedVersion: 0,
      nameEn: "Half translated",
      nameAr: "",
      ...routeForm(),
      translation: formDocument([
        {
          ...routeQuestion("أي خط حافلة؟", ["المعادي", "الزمالك"]),
          options: QUESTION.options.slice(0, 1),
        },
      ]),
    });
    expect(
      await rejection(
        api.intakes.publishForm({ id: form.id, expectedVersion: form.version }),
      ),
    ).toMatchObject({ message: "form.question_unready" });
  });

  test("the seeded school has next year's KG1 intake open with its checklist", async () => {
    const api = await principal();
    const { years } = await api.intakes.options();
    const year = years.find((row) => row.titleEn === "2027–2028");
    const { intakes } = await api.intakes.list({ year: year?.id ?? "" });
    const kg1 = intakes.find((row) => row.gradeEn === "KG1");
    expect(kg1).toMatchObject({
      capacity: 40,
      ageCutoffOn: "2027-10-01",
      minAgeMonths: 48,
      maxAgeMonths: 71,
      live: 5,
    });
    expect(kg1?.checklist.map((item) => item.labelEn)).toContain(
      "Birth certificate",
    );
  });
});

describe("registering to apply", () => {
  test("a new address is sent a link, and using it opens an applying family's account", async () => {
    const email = "salama.register@example.com";
    const { api } = await registeredFamily(email);
    const { message } = registrationLink(email);
    expect(message?.subject).toContain("confirm your email");
    const me = await api.identity.currentUser();
    expect(me).toMatchObject({ workspace: "family" });
    const mine = await api.applying.mine();
    expect(mine.applications).toEqual([]);
    expect(mine.intakes.map((row) => row.gradeEn)).toContain("KG1");
    // A family that only applies reaches nothing of the school's own.
    expect(await rejection(api.applications.list({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("an address that already signs in is told so in its inbox, and the page says the same", async () => {
    const address = login("parent");
    const answer = await client("northwind").applying.register({
      names: names("Salama Ashoush", "سلامة عشوش"),
      email: address,
      phone: "",
      locale: "en",
      elapsed: 5000,
    });
    expect(answer).toEqual({ registered: true });
    const sent = seeded().mail.sent.findLast((row) => row.to === address);
    expect(sent?.subject).toContain("already have an account");
    expect(sent?.text).not.toMatch(/\/welcome#/);
  });

  test("a form filled faster than a person types is answered and dropped", async () => {
    const email = "salama.script@example.com";
    await client("northwind").applying.register({
      names: names("Salama Ashoush", "سلامة عشوش"),
      email,
      phone: "",
      locale: "en",
      elapsed: 100,
    });
    expect(registrationLink(email).message).toBeUndefined();
  });

  test("where Turnstile is set up, a token Cloudflare does not accept stops the registration", async () => {
    const handler = handlerWith({
      turnstile: createTurnstile({
        siteKey: "site",
        secretKey: "secret",
        fetch: (() =>
          Promise.resolve(
            Response.json({ success: false }),
          )) as unknown as typeof fetch,
      }),
    });
    const response = await handler(
      new Request("http://api.test/rpc/applying/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-farida-school": "northwind",
        },
        body: JSON.stringify({
          json: {
            names: names("Salama Ashoush", "سلامة عشوش"),
            email: "salama.robot@example.com",
            phone: "",
            locale: "en",
            elapsed: 5000,
            turnstile: "forged",
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("site.challenge");
  });

  test("where the school sends no email, registering says so rather than pretend it sent", async () => {
    const handler = handlerWith({
      mail: null,
      channels: { email: false, sms: false },
    });
    const response = await handler(
      new Request("http://api.test/rpc/applying/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-farida-school": "northwind",
        },
        body: JSON.stringify({
          json: {
            names: names("Salama Ashoush", "سلامة عشوش"),
            email: "salama.nomail@example.com",
            phone: "",
            locale: "en",
            elapsed: 5000,
          },
        }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("register.no_mail");
    expect(
      registrationLink("salama.nomail@example.com").message,
    ).toBeUndefined();
  });

  test("confirming the address names the family on the enquiry they made with it", async () => {
    const email = "salama.enquired@example.com";
    const office = await officer();
    const { id: enquiryId } = await office.admissions.logEnquiry({
      source: "phone",
      purpose: "enquiry",
      locale: "en",
      name: "Salama Ashoush",
      email,
      phone: "",
      childName: "Laila",
      childYear: "KG1",
      message: "",
      assigneeId: "",
    });
    await registeredFamily(email);
    const enquiry = await office.admissions.enquiry({ id: enquiryId });
    expect(enquiry.familyUserId).not.toBeNull();
    expect(enquiry.applicantUserId).toBeNull();
  });
});

describe("an application", () => {
  test("is drafted, kept in the systems that keep each part, sent with its consents, and read by the office", async () => {
    const { intakeId } = await intakeFor("KG2");
    const email = "salama.applies@example.com";
    const office = await officer();
    const { id: enquiryId } = await office.admissions.logEnquiry({
      source: "walk_in",
      purpose: "enquiry",
      locale: "en",
      name: "Salama Ashoush",
      email,
      phone: "",
      childName: "Omar",
      childYear: "KG2",
      message: "",
      assigneeId: "",
    });
    const { api } = await registeredFamily(email);
    const draft = await filledDraft(api, intakeId);

    const read = await api.applying.draft({ id: draft.id });
    expect(read.child.document?.shown).toBe("••••••••");
    expect(read.needs.allergy).toBe("Peanuts");
    expect(read.application.state).toBe("draft");
    expect(read.child.age).toBe("fits");

    // Sending without agreeing to how the application is used is refused.
    expect(
      await rejection(
        api.applying.submit({
          id: draft.id,
          expectedVersion: draft.version,
          locale: "en",
          consents: [],
        }),
      ),
    ).toMatchObject({ message: "application.consent" });

    const sent = await api.applying.submit({
      id: draft.id,
      expectedVersion: draft.version,
      locale: "en",
      consents: await consents(api, draft.id),
    });
    expect(sent.reference).toMatch(/^2027-\d{4}$/);

    const mine = await api.applying.mine();
    expect(mine.applications[0]).toMatchObject({
      state: "submitted",
      reference: sent.reference,
      needed: 1,
    });

    const { rows } = await office.applications.list({ intake: intakeId });
    expect(rows.map((row) => row.reference)).toEqual([sent.reference]);
    expect(rows[0]?.priorities).toEqual(["additional_needs"]);
    const record = await office.applications.application({ id: draft.id });
    expect(record).toMatchObject({
      state: "submitted",
      enquiryId,
      moves: ["in_review", "withdrawn"],
      family: { email },
      answers: [{ prompt: "Which bus route?", text: "Maadi" }],
    });
    expect(record.consents.map((row) => row.decision)).toEqual([
      "granted",
      "granted",
      "granted",
    ]);
    expect(record.child.documents[0]?.shown).toBe("••••••••");
    // Health and needs are their own read, behind the health purpose.
    expect(record).not.toHaveProperty("needs");
    const needs = await office.applications.needs({ id: draft.id });
    expect(needs.additional_needs).toBe("Speech therapy twice a week");

    const enquiry = await office.admissions.enquiry({ id: enquiryId });
    expect(enquiry).toMatchObject({ state: "converted" });
    expect(enquiry.applicantUserId).toBe(record.child.id);

    // The office was told, and so was the family, through notifications.
    const officeInbox = await office.notifications.list({});
    expect(
      officeInbox.rows.some(
        (row) => row.kind === "application" && row.subjectId === draft.id,
      ),
    ).toBe(true);
    const familyInbox = await api.notifications.list({});
    expect(
      familyInbox.rows.some(
        (row) =>
          row.kind === "application" &&
          (row.params as { received?: boolean }).received === true,
      ),
    ).toBe(true);

    // A sent application is no longer the family's to change.
    expect(
      await rejection(
        api.applying.save({
          id: draft.id,
          expectedVersion: sent.version,
          child: { ...child(draft.sexId), birthDate: "2022-03-14" },
          form: { ...read.application.form, other: null },
          needs: null,
        }),
      ),
    ).toMatchObject({ message: "application.sent" });

    const reviewing = await office.applications.move({
      id: draft.id,
      expectedVersion: record.version,
      state: "in_review",
      note: "",
    });
    await office.applications.note({
      id: draft.id,
      body: "Called the family.",
    });
    const history = await office.applications.application({ id: draft.id });
    expect(history.state).toBe("in_review");
    expect(history.entries.map((row) => row.kind)).toEqual([
      "state",
      "state",
      "note",
    ]);
    expect(reviewing.version).toBeGreaterThan(record.version);
  });

  test("a document goes up for its checklist step, and the office checks it", async () => {
    const { intakeId } = await intakeFor("Grade 3");
    const { api, token } = await registeredFamily(
      "salama.documents@example.com",
    );
    const draft = await filledDraft(api, intakeId, { birthDate: "2019-02-02" });
    const body = new Blob(["%PDF-1.4 birth certificate"]);
    const file = await api.files.initiate({
      purpose: "admission_document",
      name: "birth-certificate.pdf",
      mediaType: "application/pdf",
      sizeBytes: body.size,
    });
    const put = await raw("northwind", token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body,
    });
    expect(put.status).toBe(200);
    const [step] = (await api.applying.draft({ id: draft.id })).items;
    if (!step) throw new Error("the intake's checklist was not copied");
    await api.applying.attach({
      applicationId: draft.id,
      itemId: step.id,
      fileId: file.id,
    });
    const after = await api.applying.draft({ id: draft.id });
    expect(after.items[0]).toMatchObject({
      state: "received",
      files: [{ name: "birth-certificate.pdf" }],
    });
    await api.applying.submit({
      id: draft.id,
      expectedVersion: after.application.version,
      locale: "en",
      consents: await consents(api, draft.id),
    });
    const office = await officer();
    const record = await office.applications.application({ id: draft.id });
    const item = record.items[0];
    if (!item) throw new Error("no checklist step");
    expect(item.files).toHaveLength(1);
    await office.applications.moveItem({
      applicationId: draft.id,
      itemId: item.id,
      expectedVersion: item.version,
      state: "verified",
      note: "",
    });
    const checked = await office.applications.application({ id: draft.id });
    expect(checked.items[0]?.state).toBe("verified");
    expect(
      await rejection(
        api.applying.detach({ applicationId: draft.id, fileId: file.id }),
      ),
    ).toMatchObject({ message: "application.item_done" });
  });

  test("a child too young on the cut-off day cannot be sent", async () => {
    const { intakeId } = await intakeFor("Grade 4");
    const { api } = await registeredFamily("salama.young@example.com");
    const draft = await filledDraft(api, intakeId, { birthDate: "2022-01-01" });
    expect(
      await rejection(
        api.applying.submit({
          id: draft.id,
          expectedVersion: draft.version,
          locale: "en",
          consents: await consents(api, draft.id),
        }),
      ),
    ).toMatchObject({ message: "application.age_young" });
  });

  test("a family at the school applying for a sibling is recognised", async () => {
    const { intakeId } = await intakeFor("Grade 6");
    const { api } = await sessionFor("northwind", login("parent"));
    const draft = await filledDraft(api, intakeId, {
      birthDate: "2016-04-04",
      childNames: names("Yara Haddad", "يارا حداد"),
    });
    await api.applying.submit({
      id: draft.id,
      expectedVersion: draft.version,
      locale: "en",
      consents: await consents(api, draft.id),
    });
    const record = await (
      await officer()
    ).applications.application({
      id: draft.id,
    });
    expect(record.matches.siblings.length).toBeGreaterThan(0);
    expect(record.priorities).toContain("sibling");
  });

  test("another family reaches none of it, and the family withdraws it", async () => {
    const { intakeId } = await intakeFor("Grade 7");
    const { api } = await registeredFamily("salama.private@example.com");
    const draft = await filledDraft(api, intakeId, { birthDate: "2015-06-06" });
    const stranger = await registeredFamily("salama.stranger@example.com");
    expect(
      await rejection(stranger.api.applying.draft({ id: draft.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const withdrawn = await api.applying.withdraw({
      id: draft.id,
      expectedVersion: draft.version,
      reason: "another_school",
      note: "",
    });
    expect(withdrawn.version).toBeGreaterThan(draft.version);
    const mine = await api.applying.mine();
    expect(mine.applications[0]?.state).toBe("withdrawn");
  });

  test("a withdrawn applicant comes up for review after the school's months", async () => {
    const api = await principal();
    await api.privacy.saveRetention({
      studentRule: null,
      studentValue: null,
      staffYears: null,
      applicantMonths: 12,
    });
    const overview = await api.privacy.overview();
    const applicant = overview.review.find((row) => row.kind === "applicant");
    expect(applicant).toMatchObject({ dueOn: "2100-12-31" });
  });
});
