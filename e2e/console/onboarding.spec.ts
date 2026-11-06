import { expect, test } from "@playwright/test";

import {
  createSchool,
  hydrated,
  OWNER,
  schoolAdministrator,
  signInAs,
  unique,
} from "../fixtures/console";
import { portal } from "../fixtures/sign-in";

test("a new school's first steps show to its operators and its administrators alike", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);
  const slug = `e2e-${unique()}`;
  const schoolName = `Aspen ${slug}`;
  await createSchool(page, { slug, nameEn: schoolName, nameAr: "مدرسة الحور" });

  // The console opens on what needs someone, and the schools list says how each is doing.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Needs attention" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Onboarding stalled" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Console" })
    .getByRole("link", { name: "Schools" })
    .click();
  const row = page.getByRole("row", { name: new RegExp(schoolName) });
  await expect(row).toContainText("Healthy");
  await row.getByRole("link", { name: schoolName }).click();

  // The operator's own step, ticked off on the school's page.
  const onboarding = page.getByRole("region", { name: "Onboarding" });
  await hydrated(onboarding.getByRole("list"));
  const call = onboarding
    .getByRole("listitem")
    .filter({ hasText: "Kick-off call" });
  await expect(call).toContainText("Not yet");
  await call.getByRole("button", { name: "Tick off Kick-off call" }).click();
  await expect(call).toContainText("Ticked by an operator");
  await expect(
    call.getByRole("button", { name: "Untick Kick-off call" }),
  ).toBeVisible();

  // The school's administrators see the same steps on their Today page.
  const { page: school, context } = await schoolAdministrator(browser, slug);
  await school.goto(`${portal(slug)}/admin`);
  const card = school.getByRole("region", { name: "Getting started" });
  const step = (name: string) =>
    card.getByRole("listitem").filter({ hasText: name });
  await expect(step("Kick-off call with our team")).toContainText("Done");
  await expect(step("An administrator signs in")).toContainText("Done");
  await expect(step("Classes set up")).toContainText("To do");
  await context.close();
});
