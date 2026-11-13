import { addYears } from "@faridalms/domain/privacy";
import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { names } from "./fixtures/school";
import { PASSWORD, portal, untilHydrated } from "./fixtures/sign-in";

test("at a school with years and without families, a learner answers whether they return", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, { without: ["families"] });
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await api.identity.currentUser();
  const days = { startsOn: addDays(today, -20), endsOn: addDays(today, 200) };
  const next = { startsOn: addDays(today, 260), endsOn: addDays(today, 560) };
  const [source, target] = await Promise.all([
    api.years.save({
      titleEn: "Salama's first year",
      titleAr: "",
      ...days,
      terms: [],
    }),
    api.years.save({
      titleEn: "Salama's next year",
      titleAr: "",
      ...next,
      terms: [],
    }),
  ]);
  const klass = await api.classes.save({
    code: "PY-101",
    titleEn: "Python from scratch",
    titleAr: "",
    teacherIds: [],
    ...days,
    parts: { year: { yearId: source.id } },
  });
  const {
    rows: [pupil],
  } = await api.people.students({ q: "Salama Pupil" });
  if (!pupil) throw new Error("the school has no pupil");
  const current = await api.people.student({ id: pupil.id });
  await api.people.saveStudent({
    id: pupil.id,
    expectedVersion: current.version,
    names: names("Salama", "Pupil"),
    reference: current.reference ?? "",
    birthDate: addYears(today, -20),
  });
  await api.classes.enrol({ studentId: pupil.id, classId: klass.id });

  await signInTo(page, school, "admin");
  await page.goto(
    `${portal(school.slug)}/rollover?source=${source.id}&target=${target.id}`,
  );
  await untilHydrated(page);
  await expect(page.getByText(/famil/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Ask about next year" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ask", exact: true })
    .click();
  await expect(page.getByText(/^Asked on /)).toBeVisible();

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await signInTo(learner, school, "student");
  await untilHydrated(learner);
  const question = learner.getByRole("group", {
    name: "Will you return in Salama's next year?",
  });
  await expect(question).toBeVisible();
  await question.getByRole("radio", { name: "Yes, returning" }).click();
  await expect(learner.getByText(/^The school has your answer/)).toBeVisible();
  await learnerContext.close();

  await page.reload();
  await untilHydrated(page);
  await expect(
    page.getByText("Answer: returning", { exact: true }).first(),
  ).toBeVisible();
});
