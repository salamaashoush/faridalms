import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { PASSWORD, untilHydrated } from "./fixtures/sign-in";

test("a new school's administrator is taken through its setup in order, ticked from its own data", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser);
  await signInTo(page, school, "admin");
  await untilHydrated(page);
  const guide = page.getByRole("region", { name: "Getting started" });
  await expect(guide.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  // The first step not taken is the next one: the school's details.
  const step = (name: string) =>
    guide.getByRole("listitem").filter({ hasText: name });
  await expect(step("School details and logo")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(step("Staff")).toContainText("Done");
  await expect(step("Website")).toContainText("Optional");
  await expect(step("An administrator signs in")).toContainText("Done");
  await expect(
    guide.getByRole("button", { name: "Hide" }),
    "a setup half done cannot be put away",
  ).toHaveCount(0);

  // A year with a term, made anywhere, ticks its step.
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await api.identity.currentUser();
  await api.years.save({
    titleEn: "Salama's first year",
    titleAr: "",
    startsOn: addDays(today, -30),
    endsOn: addDays(today, 270),
    terms: [
      {
        titleEn: "Term 1",
        titleAr: "",
        startsOn: addDays(today, -30),
        endsOn: addDays(today, 100),
      },
    ],
  });
  await page.reload();
  await expect(step("School year, terms and calendar")).toContainText("Done");

  await guide
    .getByRole("link", { name: "Start: School details and logo" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);

  // A teacher has nothing to set up, so their Today has no guide.
  const teacher = await browser.newPage();
  await signInTo(teacher, school, "teacher");
  await untilHydrated(teacher);
  await expect(
    teacher.getByRole("region", { name: "Getting started" }),
  ).toHaveCount(0);
  await teacher.close();
});
