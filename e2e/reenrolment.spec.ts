import { expect, test } from "@playwright/test";

import { apiAs } from "./fixtures/api";
import {
  ACCOUNTS,
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser plans a year of its own, since years may not overlap.
const TARGET = {
  chromium: { title: "2095–2096", start: "2095-09-05", end: "2096-06-14" },
  firefox: { title: "2097–2098", start: "2097-09-04", end: "2098-06-13" },
  webkit: { title: "2099–2100", start: "2099-09-03", end: "2100-06-11" },
} as const;

test("the office asks families about next year, a parent answers, and the rollover shows it", async ({
  page,
  browser,
  browserName,
}) => {
  const target = TARGET[browserName];
  const admin = await apiAs("admin");
  const { years } = await admin.years.directory();
  const source = years.find((row) => row.lifecycle === "current");
  if (!source) throw new Error("seed current year");
  const { id: targetId } = await admin.years.save({
    titleEn: target.title,
    titleAr: "",
    startsOn: target.start,
    endsOn: target.end,
    terms: [],
  });

  await signIn(page, "admin");
  await page.goto(`/rollover?source=${source.id}&target=${targetId}`);
  await untilHydrated(page);
  const asked = page.getByText(/^Families asked on /);
  if (!(await asked.isVisible())) {
    await page
      .getByRole("button", { name: "Ask families about next year" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Ask families", exact: true })
      .click();
  }
  await expect(asked).toBeVisible();

  const parentContext = await browser.newContext();
  const parent = await parentContext.newPage();
  await signInWith(parent, ACCOUNTS.parent.email, PASSWORD, "/family");
  await untilHydrated(parent);
  const question = parent.getByRole("group", { name: /^Will .+ return in / });
  await expect(question.first()).toBeVisible();
  const name = (await question.first().textContent())
    ?.match(/^Will (.+) return in /)?.[1]
    ?.trim();
  await question
    .first()
    .getByRole("radio", { name: "No, leaving the school" })
    .click();
  await expect(
    parent.getByText(/^The school has your answer/).first(),
  ).toBeVisible();
  await parentContext.close();

  await page.reload();
  await untilHydrated(page);
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: name ?? "" })
      .getByText("Family: leaving", { exact: true })
      .first(),
  ).toBeVisible();
});
