import { expect, test } from "@playwright/test";

import { chooseFromMenu, signIn, untilHydrated } from "./fixtures/sign-in";

test("a school adds a grade scale and changes its grades one at a time", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/exams?tab=scales");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add scale" }).first().click();
  const adding = page.getByRole("dialog", { name: "Add scale" });
  await adding
    .getByRole("textbox", { name: "Name in English" })
    .fill("School IGCSE");
  // A grade of a scale not yet added is changed in its own sheet and kept
  // with the scale when it is saved.
  await adding.getByRole("button", { name: "U", exact: true }).click();
  const grade = page.getByRole("dialog", { name: "Change U" });
  await grade.getByRole("textbox", { name: "Grade", exact: true }).fill("X");
  await grade.getByRole("button", { name: "Done" }).click();
  await expect(grade).toBeHidden();
  await expect(
    adding.getByRole("row", { name: /^X / }).getByRole("cell", {
      name: "0 to under 20",
    }),
  ).toBeVisible();
  await adding.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();

  await page.getByRole("button", { name: "School IGCSE", exact: true }).click();
  const scale = page.getByRole("dialog", { name: "School IGCSE" });
  await scale.getByRole("button", { name: "A", exact: true }).click();
  const change = page.getByRole("dialog", { name: "Change A" });
  const from = change.getByRole("textbox", { name: "Starts at, %" });
  await from.fill("70");
  await change.getByRole("textbox", { name: "Why" }).fill("Board moved it");
  await change.getByRole("button", { name: "Save" }).click();
  await expect(from).toHaveAccessibleDescription(
    "Two grades start at the same percentage.",
  );
  await from.fill("85");
  await expect(change.getByText("Covers 85 to under 90.")).toBeVisible();
  await change.getByRole("button", { name: "Save" }).click();
  await expect(change).toBeHidden();
  await expect(
    scale.getByRole("row", { name: /^A / }).getByRole("cell", {
      name: "85 to under 90",
    }),
  ).toBeVisible();
  await expect(
    scale.getByRole("row", { name: /^B / }).getByRole("cell", {
      name: "70 to under 85",
    }),
  ).toBeVisible();

  await chooseFromMenu(
    scale.getByRole("button", { name: "Actions for G" }),
    page.getByRole("menuitem", { name: "Remove" }),
  );
  const removing = page.getByRole("dialog", { name: "Remove G?" });
  await removing.getByRole("button", { name: "Remove" }).click();
  await expect(
    removing.getByRole("textbox", { name: "Why" }),
  ).toHaveAccessibleDescription("Say why, for the history.");
  await removing.getByRole("textbox", { name: "Why" }).fill("Not awarded");
  await removing.getByRole("button", { name: "Remove" }).click();
  await expect(removing).toBeHidden();
  await expect(scale.getByRole("row", { name: /^G / })).toHaveCount(0);
  await expect(
    scale.getByRole("row", { name: /^X / }).getByRole("cell", {
      name: "0 to under 30",
    }),
  ).toBeVisible();
});
