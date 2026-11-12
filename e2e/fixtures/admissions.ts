import type { Api } from "./api";

import { apiAs, signedInApi } from "./api";
import { PASSWORD } from "./sign-in";

/** The seed's two registered families, with an application each already. */
export const FAMILIES = {
  first: "applicant.northwind@northwind.example.com",
  second: "applicant2.northwind@northwind.example.com",
} as const;

// The seed's application form: how the family heard of the school is required.
const HEARD_OF_US = "0192f0a4-7a1c-7b5a-9a2e-5e6f1f2a3d01";
const OPEN_DAY = "0192f0a4-7a1c-7b5a-9a2e-5e6f1f2a3d14";

const split = (name: string) => ({
  given: name.split(" ")[0] ?? "",
  middle: "",
  family: name.split(" ").slice(1).join(" "),
});

/** A child's names in English and in Arabic, unique to one run of a spec. */
export function childNamed(run: string) {
  return { en: `Salama Ashoush ${run}`, ar: `سلامة عشوش ${run}` };
}

/**
 * An application of a new child to the seed's KG1 intake, sent by one of
 * the seed's families, with the school before and a need to read, so a
 * spec works on a record no other spec or browser touches.
 */
export async function sentApplication(
  email: string,
  child: ReturnType<typeof childNamed>,
  locale: "en" | "ar" = "en",
) {
  const { api } = await signedInApi(email, PASSWORD);
  const office = await apiAs("admin");
  const intake = (await office.intakes.list({})).intakes.find(
    (row) => row.facts.grade?.labelEn === "KG1",
  );
  if (!intake) throw new Error("the seed has no KG1 intake");
  const { options } = await api.applying.mine();
  const kid = {
    names: { en: split(child.en), ar: split(child.ar) },
    birthDate: "2022-03-14",
    sexId: options.sexes[0]?.id ?? "",
    document: null,
  };
  const started = await api.applying.start({
    intakeId: intake.id,
    applicantId: "",
    child: kid,
    locale,
  });
  const saved = await api.applying.save({
    id: started.id,
    expectedVersion: started.version,
    child: kid,
    form: {
      relationId:
        options.relations.find((row) => row.meaning === "father")?.id ?? "",
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
      // A choice is answered by its option, the same in either language.
      answers: {
        [HEARD_OF_US]: { type: "choice", optionIds: [OPEN_DAY] },
      },
    },
    needs: {
      chronic_condition: "",
      allergy: "",
      medication: "",
      dietary_requirement: "",
      additional_needs: "Speech therapy twice a week",
    },
  });
  const draft = await api.applying.draft({ id: started.id });
  const sent = await api.applying.submit({
    id: started.id,
    expectedVersion: saved.version,
    locale,
    consents: draft.consents.flatMap((consent) =>
      consent.notice ? [{ noticeId: consent.notice.id, agreed: true }] : [],
    ),
  });
  return { id: started.id, reference: sent.reference, office };
}

/** The application taken into review by the office. */
export async function inReview(office: Api, id: string) {
  const { version } = await office.applications.application({ id });
  await office.applications.move({
    id,
    expectedVersion: version,
    state: "in_review",
    note: "",
  });
}

/** The office's decision, held until it is released. */
export async function decided(
  office: Api,
  id: string,
  decision: "offer" | "waitlist" | "decline",
) {
  const { version } = await office.applications.application({ id });
  await office.decisions.decide({
    applications: [{ id, expectedVersion: version }],
    decision,
    note: "",
  });
}
