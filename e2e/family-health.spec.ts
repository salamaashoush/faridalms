import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser follows its own family, so parallel projects never answer
// each other's requests.
const FAMILY: Record<string, string> = {
  chromium: "parent1011@northwind.example.com",
  firefox: "parent1012@northwind.example.com",
  webkit: "parent1013@northwind.example.com",
};

test("a parent asks to add an allergy, the office accepts, and the parent sees it and the notice", async ({
  browser,
  page,
  browserName,
}) => {
  const allergy = `Sesame ${browserName} ${crypto.randomUUID().slice(0, 6)}`;
  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(
    family,
    FAMILY[browserName] ?? FAMILY.chromium ?? "",
    PASSWORD,
    "/family",
  );
  await family.goto("/family/children");
  await untilHydrated(family);
  await family.getByRole("link", { name: "Medical summary" }).first().click();
  const heading = family.getByRole("heading", {
    level: 1,
    name: /'s medical summary$/,
  });
  await expect(heading).toBeVisible();
  const child = ((await heading.textContent()) ?? "").replace(
    /'s medical summary$/,
    "",
  );
  await expect(
    family.getByRole("region", { name: "Emergency contacts" }),
  ).toBeVisible();

  const allergies = family.getByRole("region", { name: "Allergies" });
  await allergies.getByRole("button", { name: "Ask to add" }).click();
  const sheet = family.getByRole("dialog", { name: "Add an allergy" });
  await sheet.getByRole("button", { name: "Send to the school" }).click();
  await expect(sheet.getByText("This field is required")).toBeVisible();
  await sheet.getByRole("textbox", { name: "Details" }).fill(allergy);
  await sheet.getByRole("combobox", { name: /Severity/ }).click();
  await family.getByRole("option", { name: "Severe" }).click();
  await sheet.getByRole("button", { name: "Send to the school" }).click();
  await expect(sheet).toBeHidden();
  const requests = family.getByRole("region", { name: "Your requests" });
  await expect(requests.getByText(allergy)).toBeVisible();
  await expect(requests.getByText("Waiting")).toBeVisible();
  await expect(allergies.getByText(allergy)).toBeHidden();

  await signIn(page, "admin");
  await page.goto("/health-changes");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: /Medical updates/ }),
  ).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(child) }).first();
  await row.getByRole("button", { name: "Review" }).click();
  const review = page.getByRole("dialog", {
    name: `Change for ${child}`,
  });
  await expect(review.getByText(`${allergy} · Severe`)).toBeVisible();
  await review.getByRole("button", { name: "Accept the change" }).click();
  await expect(review).toBeHidden();

  await family.reload();
  await untilHydrated(family);
  await expect(
    family.getByRole("region", { name: "Allergies" }).getByText(allergy),
  ).toBeVisible();
  await expect(
    family.getByRole("region", { name: "Your requests" }).getByText("Accepted"),
  ).toBeVisible();
  await family.goto("/notifications");
  await untilHydrated(family);
  const notice = family
    .getByRole("link", {
      name: new RegExp(`The school updated ${child}'s medical summary`),
    })
    .first();
  await expect(notice).toBeVisible();
  await notice.click();
  await expect(family).toHaveURL(/\/family\/health\?studentId=/);
  await familyContext.close();
});
