import { expect, test } from "@playwright/test";

import { chooseFromMenu, signIn, untilHydrated } from "./fixtures/sign-in";

test("a school adds a grade scale and changes its grades one at a time", async ({
  page,
}) => {
  // Each browser runs this against the same school, so its scale is its own.
  const scaleName = `School IGCSE ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "admin");
  await page.goto("/exams?tab=scales");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add scale" }).first().click();
  const adding = page.getByRole("dialog", { name: "Add scale" });
  await adding
    .getByRole("textbox", { name: "Name in English" })
    .fill(scaleName);
  // A grade of a scale not yet added is changed in its own sheet and kept
  // with the scale when it is saved.
  await adding.getByRole("button", { name: "U", exact: true }).click();
  const grade = page.getByRole("dialog", { name: "Change U" });
  await grade.getByRole("textbox", { name: "Grade", exact: true }).fill("X");
  await grade.getByRole("button", { name: "Save grade" }).click();
  await expect(grade).toBeHidden();
  await expect(
    adding.getByRole("row", { name: /^X / }).getByRole("cell", {
      name: "0 to under 20",
    }),
  ).toBeVisible();
  await adding.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();

  await page.getByRole("button", { name: scaleName, exact: true }).click();
  const scale = page.getByRole("dialog", { name: scaleName });
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

test("a programme's categories are added one at a time and weigh 100 together", async ({
  page,
}) => {
  // Each browser runs this against the same school, so its programme is its own.
  const programmeName = `School diploma ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "admin");
  await page.goto("/exams?tab=programmes");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add programme" }).first().click();
  const programme = page.getByRole("dialog", { name: "Add programme" });
  await programme
    .getByRole("textbox", { name: "Name in English" })
    .fill(programmeName);
  const addCategory = async (name: string, weight: string) => {
    await programme.getByRole("button", { name: "Add a category" }).click();
    const category = page.getByRole("dialog", { name: "Add a category" });
    await category.getByRole("textbox", { name: "Name in English" }).fill(name);
    await category.getByRole("textbox", { name: "Weight %" }).fill(weight);
    await category.getByRole("button", { name: "Add a category" }).click();
    await expect(category).toBeHidden();
  };
  await addCategory("Homework", "40");
  await expect(
    programme.getByRole("table").getByText("40 of 100"),
  ).toBeVisible();
  await programme.getByRole("button", { name: "Save" }).click();
  await expect(
    programme.getByText("The weights add up to 40%; they need to make 100%."),
  ).toBeVisible();
  await addCategory("Exams", "50");
  await programme.getByRole("button", { name: "Exams", exact: true }).click();
  const exams = page.getByRole("dialog", { name: "Change Exams" });
  await exams.getByRole("textbox", { name: "Weight %" }).fill("60");
  await expect(
    exams.getByText("With this, the weights add up to 100 of 100."),
  ).toBeVisible();
  await exams.getByRole("button", { name: "Save category" }).click();
  await expect(
    programme.getByRole("table").getByText("100 of 100"),
  ).toBeVisible();
  await programme.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(programmeName) }),
  ).toContainText("Homework");
});
