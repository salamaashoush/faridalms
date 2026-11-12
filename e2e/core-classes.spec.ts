import { expect, test } from "@playwright/test";

import { freshSchool, signInTo } from "./fixtures/fresh-school";
import {
  chooseFromMenu,
  portal,
  signIn,
  untilHydrated,
} from "./fixtures/sign-in";

test("a school without school years or homerooms runs a class with no end, enrols a student, records them as left and takes it back, naming no year anywhere", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, {
    without: ["school_years", "homerooms"],
  });
  const at = portal(school.slug);

  await signInTo(page, school, "admin");
  await page.goto(`${at}/classes`);
  await untilHydrated(page);
  await expect(page.getByRole("button", { name: /^School year/ })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await expect(page).toHaveURL(/\/class-editor$/);
  await expect(
    page.getByRole("combobox", { name: /^School year/ }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Robotics club");
  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill("نادي الروبوتات");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("ROBO-1");
  await expect(page.getByRole("textbox", { name: /^Ends on/ })).toHaveValue("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);

  await page
    .getByRole("table")
    .getByRole("link", { name: "Robotics club", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Robotics club" }),
  ).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: "From" }).first(),
  ).toBeVisible();
  // Lessons and registers are kept by school year, so a class in none reads
  // as having neither rather than failing.
  await page.getByRole("tab", { name: "Timetable", exact: true }).click();
  await expect(page.getByText("No lessons on the timetable")).toBeVisible();
  await page.getByRole("tab", { name: "Attendance", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Attendance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Take register", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  const roster = page.getByRole("region", { name: "Students" });
  await roster
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  const adding = page.getByRole("dialog");
  await adding.getByRole("combobox", { name: /^Student/ }).click();
  await page.getByRole("combobox", { name: /^Search/ }).fill("Salama Pupil");
  await page.getByRole("option", { name: "Salama Pupil", exact: true }).click();
  await adding
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  await expect(
    page.getByText("Salama Pupil joined Robotics club", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/school year/i)).toHaveCount(0);

  await roster.getByRole("link", { name: "Salama Pupil", exact: true }).click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await expect(page.getByText(/school year/i)).toHaveCount(0);
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Record as left" }),
  );
  const leaving = page.getByRole("dialog", { name: "Record as left" });
  await expect(leaving.getByRole("combobox", { name: "Reason" })).toHaveCount(
    0,
  );
  await expect(leaving.getByText(/school year/i)).toHaveCount(0);
  await expect(
    leaving.getByRole("radio", { name: "Ends with the last day" }),
  ).toBeChecked();
  await leaving.getByRole("button", { name: "Record as left" }).click();
  await expect(
    page.getByText("Recorded: Salama Pupil's last day is"),
  ).toBeVisible();
  await expect(leaving).toBeHidden();

  await page.getByRole("tab", { name: "Enrollment", exact: true }).click();
  const departure = page.getByRole("region", { name: "Leaving" });
  await expect(departure).toContainText("Last day");
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Undo leaving" }),
  );
  await page
    .getByRole("dialog", { name: "Undo Salama Pupil's leaving?" })
    .getByRole("button", { name: "Undo leaving" })
    .click();
  await expect(page.getByText("Salama Pupil is enrolled again.")).toBeVisible();
  await expect(departure).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: "Classes" })
      .getByRole("link", { name: "Robotics club", exact: true }),
  ).toBeVisible();

  for (const path of ["/academic-years", "/rollover"]) {
    await page.goto(`${at}${path}`);
    await expect(
      page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
  }
});

test("a school without school years keeps homerooms that run with no end", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  await signInTo(page, school, "admin");
  await page.goto(`${portal(school.slug)}/homeroom-editor`);
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Add homeroom" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /^School year/ }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Salama's form");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("FORM-1");
  await expect(page.getByRole("textbox", { name: /^Ends on/ })).toHaveValue("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);
  await page.getByRole("tab", { name: "Homerooms" }).click();
  await expect(
    page.getByRole("table").getByRole("link", { name: "Salama's form" }),
  ).toBeVisible();
  await expect(page.getByText(/school year/i)).toHaveCount(0);
});

test("the class and homeroom editors open from a bare address on the working year", async ({
  page,
}) => {
  await signIn(page, "admin");
  for (const [path, heading] of [
    ["/class-editor", "Add class"],
    ["/homeroom-editor", "Add homeroom"],
  ] as const) {
    await page.goto(path);
    await untilHydrated(page);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    const year = page.getByRole("combobox", { name: /^School year/ });
    await expect(year).toBeVisible();
    await expect(year).not.toHaveText("No school year");
    await expect(
      page.getByRole("textbox", { name: /^Starts on/ }),
    ).not.toHaveValue("");
  }
});
