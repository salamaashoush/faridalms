import { addYears } from "@faridalms/domain/privacy";
import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import {
  consents,
  intakeFor,
  names,
  NO_NEEDS,
  officer,
  principal,
  QUESTION,
  MAADI,
  filledDraft,
  registeredFamily,
} from "./admission-fixtures";
import { client, login, rejection, signedIn, withoutModules } from "./harness";

type Applicant = Awaited<ReturnType<typeof registeredFamily>>["api"];
type Office = Awaited<ReturnType<typeof officer>>;

const SELF_FORM = {
  relationId: "",
  responsible: false,
  phone: "01005550188",
  other: null,
  schools: [],
  answers: { [QUESTION.id]: { type: "choice" as const, optionIds: [MAADI] } },
};

/** Starts an application for the person themself and saves it with their birth date. */
async function ownDraft(api: Applicant, intakeId: string, birthDate: string) {
  const started = await api.applying.start({
    intakeId,
    self: true,
    child: null,
    locale: "en",
  });
  const { options } = await api.applying.mine();
  const saved = await api.applying.save({
    id: started.id,
    expectedVersion: started.version,
    child: {
      names: names("Salama Ashoush", "سلامة عشوش"),
      birthDate,
      sexId: options.sexes[0]?.id ?? "",
      document: null,
    },
    form: SELF_FORM,
    needs: NO_NEEDS,
  });
  return { id: started.id, version: saved.version };
}

const send = async (api: Applicant, draft: { id: string; version: number }) =>
  api.applying.submit({
    id: draft.id,
    expectedVersion: draft.version,
    locale: "en",
    consents: await consents(api, draft.id),
  });

/** Saves the school's settings as they are, with the adults setting as given. */
async function setAdults(office: Office, adults: boolean) {
  const profile = await office.school.profile();
  await office.school.saveProfile({
    expectedVersion: profile.version,
    nameEn: profile.nameEn ?? "",
    nameAr: profile.nameAr ?? "",
    identifier: profile.identifier ?? "",
    timeZone: profile.timeZone ?? "Africa/Cairo",
    defaultLocale: profile.defaultLocale,
    weekStart: profile.weekStart,
    weekendDays: profile.weekendDays,
    secondaryCalendar: profile.secondaryCalendar ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    learnersAreAdults: adults,
  });
}

/** Continues the person's session in another context, as the portal does after `applyAs`. */
async function turnTo(token: string, context: "student" | "family") {
  const session = await client("northwind", token).identity.switchContext({
    context,
  });
  return { api: client("northwind", session.token), token: session.token };
}

describe("an adult applying for themself at a school with families", () => {
  test("applies in their own context with no family step, and enrolment links no guardian", async () => {
    const { intakeId } = await intakeFor("Grade 5", { anyAge: true });
    const { api } = await registeredFamily("salama.self@example.com", "self");
    const me = await api.identity.currentUser();
    expect(me.context).toBe("student");
    expect(me.roles).toContain("applicant");
    expect(me.roles).not.toContain("applicant_family");

    const mine = await api.applying.mine();
    expect(mine).toMatchObject({ self: true, eitherWay: true });
    const draft = await ownDraft(api, intakeId, "1990-02-11");
    const read = await api.applying.draft({ id: draft.id });
    expect(read.application.self).toBe(true);
    const sent = await send(api, draft);

    const office = await officer();
    const record = await office.applications.application({ id: draft.id });
    expect(record.family.id).toBe(record.child.id);
    expect(record.family.relation).toBeNull();

    const { version } = await office.applications.move({
      id: draft.id,
      expectedVersion: sent.version,
      state: "in_review",
      note: "",
    });
    await office.decisions.decide({
      applications: [{ id: draft.id, expectedVersion: version }],
      decision: "offer",
      note: "",
    });
    await office.decisions.release({
      applications: [
        {
          id: draft.id,
          expectedVersion: (
            await office.applications.application({ id: draft.id })
          ).version,
        },
      ],
    });
    const offered = (await api.applying.mine()).applications.find(
      (row) => row.id === draft.id,
    );
    await api.applying.answer({
      id: draft.id,
      expectedVersion: offered?.version ?? 0,
      answer: "accept",
      note: "",
    });
    const { enrolled } = await office.decisions.convert({
      applications: [
        {
          id: draft.id,
          expectedVersion: (
            await office.applications.application({ id: draft.id })
          ).version,
        },
      ],
    });
    const studentId = enrolled[0]?.studentId ?? "";
    expect(studentId).toBe(me.id);
    expect((await office.guardians.ofStudent({ studentId })).guardians).toEqual(
      [],
    );
  });

  test("the school's deciding age, or its adults setting, lets someone send for themself", async () => {
    const { intakeId } = await intakeFor("Grade 5", { anyAge: true });
    const { api } = await registeredFamily("salama.age@example.com", "self");
    const { today } = await api.identity.currentUser();
    const eighteen = addYears(today, -18);

    const young = await ownDraft(api, intakeId, addDays(eighteen, 1));
    expect(await rejection(send(api, young))).toMatchObject({
      message: "application.self_minor",
    });
    const head = await principal();
    await setAdults(head, true);
    try {
      expect(await send(api, young)).toMatchObject({
        reference: expect.any(String),
      });
    } finally {
      await setAdults(head, false);
    }

    const { api: other } = await registeredFamily(
      "salama.of-age@example.com",
      "self",
    );
    expect(
      await send(other, await ownDraft(other, intakeId, eighteen)),
    ).toMatchObject({ reference: expect.any(String) });
  });
});

describe("one person applying both ways", () => {
  test("keeps their own applications and those for others in separate lists", async () => {
    const { intakeId } = await intakeFor("Grade 1", { anyAge: true });
    const { api: family, token } = await registeredFamily(
      "salama.both@example.com",
    );
    expect((await family.identity.currentUser()).context).toBe("family");
    const forChild = await filledDraft(family, intakeId);
    expect(await family.applying.applyAs({ applyingFor: "self" })).toEqual({
      context: "student",
    });

    const own = await turnTo(token, "student");
    const me = await own.api.identity.currentUser();
    expect(me.roles).toEqual(
      expect.arrayContaining(["applicant", "applicant_family"]),
    );
    expect((await own.api.applying.mine()).applications).toEqual([]);
    expect(
      await rejection(own.api.applying.draft({ id: forChild.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const mine = await ownDraft(own.api, intakeId, "1988-06-01");
    expect(
      (await own.api.applying.mine()).applications.map((row) => row.id),
    ).toEqual([mine.id]);

    const back = await turnTo(own.token, "family");
    expect(
      (await back.api.applying.mine()).applications.map((row) => row.id),
    ).toEqual([forChild.id]);
    expect(
      await rejection(back.api.applying.draft({ id: mine.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(
        back.api.applying.start({
          intakeId,
          self: true,
          child: null,
          locale: "en",
        }),
      ),
    ).toMatchObject({ message: "application.self_only" });
  });

  test("applying for someone in one's care needs a school with families, and staff apply for no one", async () => {
    const { api, token } = await registeredFamily(
      "salama.only-self@example.com",
      "self",
    );
    expect(await api.applying.applyAs({ applyingFor: "other" })).toEqual({
      context: "family",
    });
    expect(
      (await (await turnTo(token, "family")).api.identity.currentUser())
        .context,
    ).toBe("family");
    await withoutModules("northwind", ["families"], async () => {
      expect(await client("northwind").applying.registration()).toEqual({
        forOthers: false,
      });
      const { api: alone } = await registeredFamily(
        "salama.alone@example.com",
        "self",
      );
      expect(await alone.applying.mine()).toMatchObject({
        eitherWay: false,
      });
      expect(
        await rejection(alone.applying.applyAs({ applyingFor: "other" })),
      ).toMatchObject({ message: "application.self_only" });
    });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(teacher.applying.applyAs({ applyingFor: "self" })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
