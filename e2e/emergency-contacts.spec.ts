import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import {
  ACCOUNTS,
  PASSWORD,
  portal,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

const SCHOOL = "lanternfield";
const at = portal(SCHOOL);
const ADMIN = "admin.lanternfield@lanternfield.example.com";
// A learner for each browser, none of them one another spec writes for.
const LEARNER: Record<string, string> = {
  chromium: "student4.lanternfield@lanternfield.example.com",
  firefox: "student5.lanternfield@lanternfield.example.com",
  webkit: "student6.lanternfield@lanternfield.example.com",
};

test("an adult learner keeps their own emergency contacts, the office sees them on the record, and the school says its learners are adults", async ({
  browser,
  page,
  browserName,
}) => {
  test.setTimeout(120_000);
  const login = LEARNER[browserName] ?? LEARNER.chromium ?? "";
  const contact = `Salama Ashoush ${crypto.randomUUID().slice(0, 6)}`;
  const { api: learnerApi } = await signedInApi(login, PASSWORD, SCHOOL);
  const me = await learnerApi.identity.currentUser();

  await signInWith(page, login, PASSWORD, "/me", SCHOOL);
  await page.goto(`${at}/me/details`);
  await untilHydrated(page);
  const section = page.getByRole("region", { name: "Emergency contacts" });
  await expect(section.getByRole("listitem").first()).toBeVisible();
  await section.getByRole("button", { name: "Add emergency contact" }).click();
  const sheet = page.getByRole("dialog", { name: "New emergency contact" });
  await sheet.getByRole("textbox", { name: "Name" }).fill(contact);
  await sheet.getByRole("textbox", { name: /Relationship/ }).fill("Brother");
  await sheet.getByRole("textbox", { name: "Phone", exact: true }).fill("12");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText(/phone number can't be read/)).toBeVisible();
  await sheet
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("0100 000 0095");
  await sheet.getByRole("textbox", { name: "Order of calling" }).fill("3");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  const added = section.getByRole("listitem").filter({ hasText: contact });
  await expect(added).toContainText("Brother");
  await expect(
    added.getByRole("link", { name: "+20 100 000 0095" }),
  ).toBeVisible();

  try {
    const office = await browser.newContext();
    const officePage = await office.newPage();
    await signInWith(officePage, ADMIN, PASSWORD, "/today", SCHOOL);
    await officePage.goto(`${at}/students/${me.id}?tab=details`);
    await untilHydrated(officePage);
    const onRecord = officePage.getByRole("region", {
      name: "Emergency contacts",
    });
    await expect(
      onRecord.getByRole("listitem").filter({ hasText: contact }),
    ).toBeVisible();
    await officePage.getByRole("tab", { name: "History" }).click();
    await expect(
      officePage.getByText("Emergency contact added").first(),
    ).toBeVisible();

    await officePage.goto(`${at}/settings?section=school`);
    await untilHydrated(officePage);
    await expect(
      officePage.getByRole("checkbox", { name: "Every learner is an adult" }),
    ).toBeChecked();
    const hint = officePage.getByText(
      /the school then states that every learner is an adult/,
    );
    await expect(hint).toBeVisible();
    // Without families the hint promises nothing of guardians.
    await expect(hint).not.toContainText(/guardian/i);
    await office.close();

    // In Arabic and on a phone, the learner's list reads right to left
    // and fits the screen.
    const arabic = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const phone = await arabic.newPage();
    await signInWith(phone, login, PASSWORD, "/me", SCHOOL);
    await arabic.addCookies([{ name: "language-tag", value: "ar", url: at }]);
    await phone.goto(`${at}/me/details`);
    await untilHydrated(phone);
    const inArabic = phone.getByRole("region", {
      name: "جهات الاتصال للطوارئ",
    });
    await expect(
      inArabic.getByRole("listitem").filter({ hasText: contact }),
    ).toBeVisible();
    await expect(phone.locator("html")).toHaveAttribute("dir", "rtl");
    expect(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await arabic.close();
  } finally {
    const listed = await learnerApi.people.emergencyContacts({
      personId: me.id,
    });
    for (const row of listed.contacts.filter(
      (each) => each.own && each.fullNameEn === contact && each.version,
    ))
      await learnerApi.people.removeEmergencyContact({
        personId: me.id,
        id: row.id,
        expectedVersion: row.version ?? 0,
      });
  }
});

test("Northwind's emergency contacts are still the guardians marked for emergencies, in English and Arabic", async ({
  browser,
  page,
}) => {
  const { api } = await signedInApi(ACCOUNTS.admin.email);
  const { api: learner } = await signedInApi(ACCOUNTS.student.email);
  const student = await learner.identity.currentUser();
  const { guardians } = await api.guardians.ofStudent({
    studentId: student.id,
  });
  const marked = guardians.filter((link) => link.emergencyContact);
  expect(marked.length).toBeGreaterThan(0);

  await signIn(page, "admin");
  await page.goto(`${portal()}/students/${student.id}?tab=details`);
  await untilHydrated(page);
  const section = page.getByRole("region", { name: "Emergency contacts" });
  for (const link of marked)
    await expect(section.getByText(link.fullNameEn ?? "")).toBeVisible();
  await expect(section.getByRole("listitem")).toHaveCount(marked.length);
  // A guardian is changed on the Family tab, not here.
  await expect(
    section.getByRole("button", { name: /^Actions for/ }),
  ).toHaveCount(0);

  const arabic = await browser.newContext();
  const inArabic = await arabic.newPage();
  await signInWith(
    inArabic,
    ACCOUNTS.admin.email,
    PASSWORD,
    ACCOUNTS.admin.home,
  );
  await arabic.addCookies([
    { name: "language-tag", value: "ar", url: portal() },
  ]);
  await inArabic.goto(`${portal()}/students/${student.id}?tab=details`);
  await untilHydrated(inArabic);
  const arabicSection = inArabic.getByRole("region", {
    name: "جهات الاتصال للطوارئ",
  });
  for (const link of marked)
    await expect(
      arabicSection.getByText(link.fullNameAr ?? link.fullNameEn ?? ""),
    ).toBeVisible();
  await arabic.close();
});
