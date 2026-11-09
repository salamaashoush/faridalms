import { expect, test } from "@playwright/test";

import { chooseFromMenu, signIn, untilHydrated } from "./fixtures/sign-in";

test("an intake's checklist steps and fees are changed one row at a time", async ({
  page,
}) => {
  const step = `Salama's report ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "admin");
  await page.goto("/admissions/intakes");
  await untilHydrated(page);
  await page.getByRole("table").getByRole("link").first().click();
  await page.waitForURL(/\/admissions\/intakes\/[0-9a-f-]{36}/);
  const intakeId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const open = async () => {
    await page.goto(`/admissions/intake-editor?id=${intakeId}`);
    await untilHydrated(page);
  };
  await open();

  const checklist = page.getByRole("region", { name: "Steps families meet" });
  await page.getByRole("button", { name: "Add a step", exact: true }).click();
  const adding = page.getByRole("dialog", { name: "Add a step" });
  await adding.getByRole("button", { name: "Add a step" }).click();
  await expect(
    adding.getByRole("textbox", { name: "Name in English" }),
  ).toHaveAccessibleDescription("Name the step in at least one language.");
  await adding.getByRole("textbox", { name: "Name in English" }).fill(step);
  await adding.getByRole("checkbox", { name: /Required/ }).click();
  await adding.getByRole("button", { name: "Add a step" }).click();
  await expect(adding).toBeHidden();
  await expect(checklist.getByRole("row", { name: step })).toContainText(
    "Optional",
  );

  const fees = page.getByRole("region", { name: /^Fees in/ });
  await fees
    .getByRole("button", { name: "Application fee", exact: true })
    .click();
  const fee = page.getByRole("dialog", { name: "Application fee" });
  const amount = fee.getByRole("textbox", { name: /^Amount/ });
  const before = await amount.inputValue();
  await amount.fill("750.5");
  await fee.getByRole("button", { name: "Save fee" }).click();
  await expect(fee).toBeHidden();
  await expect(
    fees.getByRole("row", { name: /^Application fee/ }),
  ).toContainText("750.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Intake saved")).toBeVisible();

  await open();
  await expect(checklist.getByRole("row", { name: step })).toBeVisible();
  await chooseFromMenu(
    checklist.getByRole("button", { name: `Actions for ${step}` }),
    page.getByRole("menuitem", { name: "Remove" }),
  );
  await page
    .getByRole("dialog", { name: `Remove ${step} from the checklist?` })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(checklist.getByRole("row", { name: step })).toHaveCount(0);
  await fees
    .getByRole("button", { name: "Application fee", exact: true })
    .click();
  await fee.getByRole("textbox", { name: /^Amount/ }).fill(before);
  await fee.getByRole("button", { name: "Save fee" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Intake saved")).toBeVisible();
});
