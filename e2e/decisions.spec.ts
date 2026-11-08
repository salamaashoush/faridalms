import { expect, test } from "@playwright/test";

import {
  childNamed,
  decided,
  FAMILIES,
  inReview,
  sentApplication,
} from "./fixtures/admissions";
import { PASSWORD, signIn, signInWith } from "./fixtures/sign-in";

const FAMILY = FAMILIES.second;

test("an offer goes from the board to the family's answer and an enrolled student", async ({
  browser,
  page,
}) => {
  // Two people, the office and the family, each through several pages.
  test.setTimeout(90_000);
  const child = childNamed(crypto.randomUUID().slice(0, 6));
  // The family applies in Arabic, so their letter is the Arabic one.
  const { id, office } = await sentApplication(FAMILY, child, "ar");
  await inReview(office, id);
  await decided(office, id, "offer");
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Intakes" }).first().click();
  await page.getByRole("link", { name: "KG1" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "KG1, 2027–2028" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Places" })).toContainText(
    "Places left",
  );

  // The decision waits, the office's alone, until it is released.
  await page.getByRole("tab", { name: /^Decided/ }).click();
  await page.getByRole("checkbox", { name: `Select ${child.en}` }).check();
  await page.getByRole("button", { name: "Release", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Release 1 decisions?");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Release", exact: true })
    .click();
  await expect(page.getByText("Decisions released: 1")).toBeVisible();
  await page.getByRole("tab", { name: /^Offered/ }).click();
  await expect(page.getByRole("link", { name: child.en })).toBeVisible();

  // The family reads the letter and accepts in their own account.
  const family = await (await browser.newContext()).newPage();
  await signInWith(family, FAMILY, PASSWORD, "/family");
  await family.getByRole("link", { name: "Applications" }).first().click();
  const card = family.getByRole("region", { name: child.en });
  await expect(card.getByText(/You are offered a place/)).toBeVisible();
  await card.getByRole("button", { name: "عرض مقعد" }).click();
  await expect(family.getByRole("dialog")).toContainText(child.ar);
  await expect(family.getByRole("dialog")).not.toContainText("{child}");
  await family.keyboard.press("Escape");
  await card.getByRole("button", { name: "Accept the place" }).click();
  await family
    .getByRole("dialog")
    .getByRole("button", { name: "Accept the place" })
    .click();
  await expect(
    family.getByText("Thank you. The school has your answer."),
  ).toBeVisible();
  await expect(card.getByText("Accepted").first()).toBeVisible();

  // The office enrols her as a student placed for next year.
  await page.reload();
  await page.getByRole("tab", { name: /^Accepted/ }).click();
  await page.getByRole("link", { name: child.en }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: child.en }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enrol", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Enrolling does all of this at once:"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enrol", exact: true })
    .click();
  await expect(
    page.getByText("Enrolled. The child is now a student."),
  ).toBeVisible();
  await expect(page.getByText("Enrolled").first()).toBeVisible();
  await page.getByRole("link", { name: "Open the student" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: child.en }),
  ).toBeVisible();
});

test("the office decides from the application page and reads the year's reports", async ({
  page,
}) => {
  const run = crypto.randomUUID().slice(0, 6);
  const child = childNamed(run);
  const { id, office } = await sentApplication(FAMILIES.first, child);
  await inReview(office, id);
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Applications" }).first().click();
  await page.getByRole("searchbox").fill(run);
  await page.getByRole("link", { name: child.en }).click();
  await page
    .getByRole("button", { name: "Decide", exact: true })
    .first()
    .click();
  await page.getByRole("radio", { name: "Waiting list" }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Decide", exact: true })
    .click();
  await expect(page.getByText("Decisions saved: 1")).toBeVisible();
  await expect(page.getByText("Decided").first()).toBeVisible();

  await page.getByRole("link", { name: "Reports" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Admission reports" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Applications by stage" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "By grade and intake" }),
  ).toContainText("KG1");

  await page.getByRole("link", { name: "Letters" }).first().click();
  await expect(
    page.getByRole("link", { name: "Offer of a place" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "عرض مقعد" })).toBeVisible();
});
