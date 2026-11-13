import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { schoolDaysBack } from "./fixtures/school";
import {
  PASSWORD,
  portal,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

const SCHOOL = "lanternfield";
const ADMIN = "admin.lanternfield@lanternfield.example.com";

// Each browser follows up a learner of its own.
const LEARNER: Record<string, string> = {
  chromium: "student2.lanternfield@lanternfield.example.com",
  firefox: "student8.lanternfield@lanternfield.example.com",
  webkit: "student11.lanternfield@lanternfield.example.com",
};

test("at the academy the office follows up a learner's absence with the learner", async ({
  page,
  browserName,
}) => {
  const login = LEARNER[browserName];
  if (!login) throw new Error(`no learner for ${browserName}`);
  const { api: office } = await signedInApi(ADMIN, PASSWORD, SCHOOL);
  const { api: learner } = await signedInApi(login, PASSWORD, SCHOOL);
  const me = await learner.identity.currentUser();
  const [day] = await schoolDaysBack(office, me.today, 1);
  if (!day) throw new Error("the academy has had no school days");
  const klass = await office.classes.save({
    code: `FU-${crypto.randomUUID().slice(0, 6)}`,
    titleEn: "Follow-up practice",
    titleAr: "",
    teacherIds: [],
    startsOn: addDays(day, -7),
    endsOn: addDays(day, 30),
  });
  await office.classes.enrol({
    studentId: me.id,
    classId: klass.id,
    from: addDays(day, -7),
  });
  const register = await office.attendance.register({
    classId: klass.id,
    date: day,
  });
  await office.attendance.save({
    classId: klass.id,
    date: day,
    periodId: register.period?.id ?? "",
    expectedVersion: register.register?.version ?? 0,
    marks: register.students.map((row) => ({
      studentId: row.id,
      meaning: "absent" as const,
    })),
  });
  const name = me.nameEn ?? "";

  await signInWith(page, ADMIN, PASSWORD, "/today", SCHOOL);
  await page.goto(`${portal(SCHOOL)}/attendance?tab=follow&date=${day}`);
  await untilHydrated(page);
  await expect(page.getByRole("tab", { name: "Follow up" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: "Log a call" }),
    hasText: name,
  });
  await expect(row.getByText("The learner").first()).toBeVisible();
  await expect(page.getByText(/famil/i)).toHaveCount(0);
  await row.getByRole("button", { name: "Log a call" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Reached" }).click();
  await sheet.getByRole("textbox", { name: "Note" }).fill("Back tomorrow.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Call logged")).toBeVisible();
  await expect(row.getByText(/^Reached, .*Back tomorrow\./)).toBeVisible();
});
