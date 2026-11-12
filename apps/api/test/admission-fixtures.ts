import type { IntakeLetters } from "@faridalms/domain/admissions";
import type { FormQuestion } from "@faridalms/domain/questions";

import { suggestedAges } from "@faridalms/domain/admissions";
import { formDocument } from "@faridalms/domain/questions";

import { client, login, seeded, signedIn } from "./harness";

export const officer = () => signedIn("northwind", login("staff"));
export const principal = () => signedIn("northwind", login("principal"));

/** The bus route question in one language, with the same ids in either. */
export const routeQuestion = (
  prompt: string,
  [first, second]: [string, string],
): Extract<FormQuestion, { type: "choice" }> => ({
  id: "0192f0a4-7a1c-7b5a-9a2e-7e6f1f2a3d01",
  type: "choice",
  prompt,
  points: 0,
  hints: [],
  explanation: "",
  tries: null,
  required: true,
  options: [
    { id: MAADI, text: first, feedback: "" },
    { id: ZAMALEK, text: second, feedback: "" },
  ],
  correctOptionIds: [],
  multiple: false,
  shuffle: false,
});
export const MAADI = "0192f0a4-7a1c-7b5a-9a2e-7e6f1f2a3d02";
export const ZAMALEK = "0192f0a4-7a1c-7b5a-9a2e-7e6f1f2a3d03";
export const QUESTION = routeQuestion("Which bus route?", ["Maadi", "Zamalek"]);

/** An application form asking the bus route, in English with its Arabic beside it. */
export const routeForm = () => ({
  primaryLocale: "en" as const,
  body: formDocument([QUESTION]),
  translation: formDocument([
    routeQuestion("أي خط حافلة؟", ["المعادي", "الزمالك"]),
  ]),
});

export const DOCUMENT_KEY = "0192f0a4-7a1c-7b5a-9a2e-7e6f1f2a3d10";

export const names = (en: string, ar: string) => ({
  en: {
    given: en.split(" ")[0] ?? "",
    middle: "",
    family: en.split(" ").slice(1).join(" "),
  },
  ar: {
    given: ar.split(" ")[0] ?? "",
    middle: "",
    family: ar.split(" ").slice(1).join(" "),
  },
});

export const INTERVIEW_KEY = "0192f0a4-7a1c-7b5a-9a2e-7e6f1f2a3d11";

/** A form and an intake of their own into a grade, open every day the tests run. */
export async function intakeFor(
  grade: string,
  more: {
    capacity?: number;
    decisionsOn?: string;
    year?: string;
    /** No age range, for a child whose age is set by someone else's record. */
    anyAge?: boolean;
    interview?: boolean;
    letters?: IntakeLetters;
  } = {},
) {
  const api = await officer();
  const [years, grades] = await Promise.all([
    api.years.options(),
    api.gradeLevels.options(),
  ]);
  const year = years.years.find(
    (row) => row.titleEn === (more.year ?? "2027–2028"),
  );
  const gradeRow = grades.grades.find((row) => row.labelEn === grade);
  if (!year || !gradeRow) throw new Error(`no upcoming year or ${grade}`);
  const form = await api.intakes.saveForm({
    expectedVersion: 0,
    nameEn: `${grade} form`,
    nameAr: "",
    ...routeForm(),
  });
  await api.intakes.publishForm({ id: form.id, expectedVersion: form.version });
  const intake = await api.intakes.saveIntake({
    expectedVersion: 0,
    titleEn: `${grade}, ${year.titleEn ?? ""}`,
    startsOn: year.startsOn,
    parts: { year: { yearId: year.id }, grade: { gradeId: gradeRow.id } },
    opensOn: "2020-01-01",
    closesOn: "2099-12-31",
    capacity: more.capacity ?? 20,
    formId: form.id,
    checklist: [
      {
        key: DOCUMENT_KEY,
        kind: "document",
        labelEn: "Birth certificate",
        labelAr: "شهادة الميلاد",
        required: true,
      },
      ...(more.interview
        ? [
            {
              key: INTERVIEW_KEY,
              kind: "interview" as const,
              labelEn: "Meeting with the family",
              labelAr: "لقاء مع الأسرة",
              required: true,
            },
          ]
        : []),
    ],
    currency: "EGP",
    fees: [{ kind: "application", amount: 1500 }],
    decisionsOn: more.decisionsOn ?? "",
    offerDays: 14,
    ageCutoffOn: "2027-10-01",
    minAgeMonths: more.anyAge
      ? null
      : suggestedAges(gradeRow.meaning).minMonths,
    maxAgeMonths: more.anyAge
      ? null
      : suggestedAges(gradeRow.meaning).maxMonths,
    priorities: [
      "sibling",
      "staff_child",
      "returning_student",
      "additional_needs",
    ],
    letters: more.letters ?? {},
  });
  return { intakeId: intake.id, formId: form.id };
}

/** The secret in the last registration link sent to an address. */
export function registrationLink(address: string) {
  const message = seeded().mail.sent.findLast((row) => row.to === address);
  const secret = /\/\/northwind\.[^/\s]+\/welcome#([A-Za-z0-9_-]{43})/.exec(
    message?.text ?? "",
  )?.[1];
  return { message, secret };
}

/** Registers a family on the portal and confirms the address, as the email link does. */
export async function registeredFamily(email: string) {
  await client("northwind").applying.register({
    names: names("Salama Ashoush", "سلامة عشوش"),
    email,
    phone: "",
    locale: "en",
    elapsed: 5000,
  });
  const { secret } = registrationLink(email);
  if (!secret) throw new Error(`no registration link went to ${email}`);
  await client("northwind").identity.acceptInvite({
    secret,
    password: "a long family password",
  });
  const session = await client("northwind").identity.signIn({
    loginName: email,
    password: "a long family password",
  });
  return { api: client("northwind", session.token), token: session.token };
}

export type Api = Awaited<ReturnType<typeof officer>>;

export async function consents(api: Api, id: string) {
  const draft = await api.applying.draft({ id });
  return draft.consents.flatMap((consent) =>
    consent.notice ? [{ noticeId: consent.notice.id, agreed: true }] : [],
  );
}

export const child = (sexId: string, birthDate = "2021-05-10") => ({
  names: names("Omar Ashoush", "عمر عشوش"),
  birthDate,
  sexId,
  document: null,
});

export const NO_NEEDS = {
  chronic_condition: "",
  allergy: "",
  medication: "",
  dietary_requirement: "",
  additional_needs: "",
};

/** Starts a draft for a new child and fills in what sending it needs. */
export async function filledDraft(
  api: Api,
  intakeId: string,
  input: { birthDate?: string; childNames?: ReturnType<typeof names> } = {},
) {
  const { options } = await api.applying.mine();
  const sexId = options.sexes[0]?.id ?? "";
  const fatherId =
    options.relations.find((row) => row.meaning === "father")?.id ?? "";
  const nationalId =
    options.documents.find((row) => row.meaning === "national_id")?.id ?? "";
  const kid = {
    names: input.childNames ?? names("Omar Ashoush", "عمر عشوش"),
    birthDate: input.birthDate ?? "2022-03-14",
    sexId,
    document: {
      systemId: nationalId,
      number: `3${(input.birthDate ?? "2022-03-14").replaceAll("-", "").slice(2)}01${String(Math.floor(Math.random() * 9000) + 1000)}3`,
      issuingCountry: "EG",
    },
  };
  const started = await api.applying.start({
    intakeId,
    applicantId: "",
    child: kid,
    locale: "en",
  });
  const saved = await api.applying.save({
    id: started.id,
    expectedVersion: started.version,
    child: { ...kid, document: { ...kid.document, number: "" } },
    form: {
      relationId: fatherId,
      responsible: true,
      phone: "01005550199",
      other: null,
      schools: [
        {
          name: "Little Steps Nursery",
          country: "EG",
          city: "Cairo",
          fromYear: 2024,
          toYear: null,
          grade: "Nursery",
          leaving: "",
        },
      ],
      answers: { [QUESTION.id]: { type: "choice", optionIds: [MAADI] } },
    },
    needs: {
      ...NO_NEEDS,
      allergy: "Peanuts",
      additional_needs: "Speech therapy twice a week",
    },
  });
  return { id: started.id, version: saved.version, sexId };
}
