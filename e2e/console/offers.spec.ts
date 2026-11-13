import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { hydrated, OWNER, signInAs } from "../fixtures/console";
import { PASSWORD, portal, signInWith } from "../fixtures/sign-in";

/** Takes a module off offer or puts it back from the catalogue's modules page. */
async function changeOffer(
  page: Page,
  module: string,
  action: "Take off offer" | "Put on offer",
) {
  const table = page.getByRole("table", { name: "Modules on offer" });
  const menu = table.getByRole("button", { name: `Actions for ${module}` });
  await hydrated(menu);
  await menu.click();
  await page.getByRole("menuitem", { name: action }).click();
  const sheet = page.getByRole("form", {
    name:
      action === "Take off offer"
        ? `Take ${module} off offer`
        : `Put ${module} on offer`,
  });
  await sheet.getByLabel("Why").fill("Checked by the browser spec");
  await sheet.getByRole("button", { name: action }).click();
  await expect(
    page.getByText(
      action === "Take off offer"
        ? `${module} is off offer.`
        : `${module} is on offer.`,
    ),
  ).toBeVisible();
}

test("the operator takes a module off offer and a school's plan card stops naming it", async ({
  browser,
  page,
}) => {
  await signInAs(page, OWNER);
  await page.goto("/catalogue");
  const catalogueMenu = page.getByRole("button", { name: "More actions" });
  await hydrated(catalogueMenu);
  await catalogueMenu.click();
  await page.getByRole("menuitem", { name: "Modules on offer" }).click();
  await expect(page).toHaveURL(/\/catalogue\/modules$/);
  const table = page.getByRole("table", { name: "Modules on offer" });
  await expect(
    table.getByRole("row", { name: /Single sign-on/ }),
  ).toContainText("Not on offer");
  await changeOffer(page, "SMS", "Take off offer");
  await expect(table.getByRole("row", { name: /^SMS/ })).toContainText(
    "Not on offer",
  );

  const portalContext = await browser.newContext();
  const school = await portalContext.newPage();
  try {
    await signInWith(
      school,
      "principal.fernhill@fernhill.example.com",
      PASSWORD,
      "/today",
      "fernhill",
    );
    const plan = school
      .locator("[data-module-catalogue]")
      .filter({ hasText: "What your plan includes" });
    await school.goto(`${portal("fernhill")}/settings`);
    await expect(plan).toContainText("Coding and blocks");
    await expect(plan).not.toContainText("Text messages");
    await expect(plan).not.toContainText("Single sign-on");
    await expect(plan).toContainText("Coursework");
    await expect(
      plan
        .getByRole("listitem")
        .filter({ hasText: "Coding and blocks" })
        .getByRole("button", { name: "Ask about this" }),
    ).toBeVisible();
  } finally {
    await portalContext.close();
  }

  await changeOffer(page, "SMS", "Put on offer");
  await expect(table.getByRole("row", { name: /^SMS/ })).toContainText(
    "On offer",
  );
  await page.goto("/changes");
  await expect(page.getByText("Taken off offer").first()).toBeVisible();
});
