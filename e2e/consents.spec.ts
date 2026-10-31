import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Every browser gives the same answer, so parallel projects agree on the end.
test("a family agrees to a consent form and the office sees it counted", async ({
  browser,
  page,
}) => {
  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(
    family,
    "parent1007@northwind.example.com",
    PASSWORD,
    "/family",
  );
  await family.goto("/family/consents");
  await untilHydrated(family);
  const card = family.getByRole("region", { name: "Photos in school news" });
  // A form still waiting on an answer opens with its words showing.
  const words = card.getByText(/May photos of your child appear/);
  if (!(await words.isVisible())) await card.getByText("Read the form").click();
  await expect(words).toBeVisible();
  const change = card.getByRole("button", { name: /^Change the answer/ });
  if (await change.isVisible()) await change.click();
  await card.getByRole("button", { name: "I agree" }).click();
  await expect(card.getByText("Agreed", { exact: true })).toBeVisible();
  await familyContext.close();

  await signIn(page, "admin");
  await page.goto("/privacy?tab=consents");
  await untilHydrated(page);
  await expect(
    page.getByRole("row", { name: /Photos in school news/ }),
  ).toContainText(/[1-9]\d* agreed/);
  await page.getByRole("link", { name: "Give medicine at school" }).click();
  await expect(page).toHaveURL(/consent-form-editor/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Give medicine at school" }),
  ).toBeVisible();
});
