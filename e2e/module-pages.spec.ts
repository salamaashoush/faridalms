import type { Page } from "@playwright/test";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { sentTo } from "./fixtures/mail";
import { PASSWORD, portal, untilHydrated } from "./fixtures/sign-in";

/** Words of families: a guardian, a parent, a family, in either language. */
const FAMILY_WORDS = {
  en: /\b(guardians?|parents?|famil(y|ies)|family's)\b/i,
  ar: /(^|[^\p{L}])(ولي الأمر|وليّ الأمر|أولياء|الوالدين|الوالد|والد|وليّة|الأسرة|أسرة|الأسر|أسرتك|أسرتكم|أسرته|العائلة|عائلة)(?=$|[^\p{L}])/u,
};

/** A person's surname is asked for as their family name, which is no family. */
const SURNAME = /^(Family name|اسم العائلة)$/;

/** The lines of a page that name families, each with the page it is on. */
async function familyWords(page: Page, path: string, language: "en" | "ar") {
  await page.goto(path);
  await expect(page.getByRole("heading").first()).toBeVisible();
  return (await page.locator("body").innerText())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !SURNAME.test(line) && FAMILY_WORDS[language].test(line))
    .map((line) => `${path}: ${line}`);
}

test("a school without families signs in, registers and takes applications in the applicant's own words, in English and Arabic", async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const school = await freshSchool(browser, { without: ["families"] });
  const at = portal(school.slug);
  const found: string[] = [];

  const stranger = await browser.newContext();
  const visitor = await stranger.newPage();
  const doors = ["/sign-in", "/register", "/apply"];
  for (const path of doors)
    found.push(...(await familyWords(visitor, `${at}${path}`, "en")));
  await visitor.goto(`${at}/sign-in`);
  await expect(visitor.getByText("Students and staff").first()).toBeVisible();
  // Someone registers only for themself, so nobody is asked who for.
  await visitor.goto(`${at}/register`);
  await expect(
    visitor.getByRole("heading", { level: 1, name: "Register to apply" }),
  ).toBeVisible();
  await expect(visitor.getByText("Who are you applying for?")).toHaveCount(0);
  await expect(visitor.getByRole("radio")).toHaveCount(0);
  await stranger.addCookies([{ name: "language-tag", value: "ar", url: at }]);
  for (const path of doors)
    found.push(...(await familyWords(visitor, `${at}${path}`, "ar")));
  await stranger.close();

  const office = await browser.newContext();
  const admin = await office.newPage();
  await signInTo(admin, school, "admin");
  const pages = [
    "/admissions/enquiries",
    "/admissions/applications",
    "/admissions/intakes",
    "/admissions/intakes?tab=forms",
  ];
  for (const path of pages) {
    found.push(...(await familyWords(admin, `${at}${path}`, "en")));
    await untilHydrated(admin);
  }
  await office.addCookies([{ name: "language-tag", value: "ar", url: at }]);
  for (const path of pages)
    found.push(...(await familyWords(admin, `${at}${path}`, "ar")));
  await office.close();

  // An intake open today, and someone who registers to apply for themself.
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const form = await api.intakes.saveForm({
    expectedVersion: 0,
    nameEn: "Evening courses form",
    nameAr: "استمارة الدورات المسائية",
    primaryLocale: "en",
    body: emptyContent(),
    translation: null,
  });
  await api.intakes.publishForm({ id: form.id, expectedVersion: form.version });
  await api.intakes.saveIntake({
    expectedVersion: 0,
    titleEn: "Evening courses",
    titleAr: "الدورات المسائية",
    startsOn: "2099-01-01",
    opensOn: "2020-01-01",
    closesOn: "2099-12-31",
    capacity: 20,
    formId: form.id,
    checklist: [],
    currency: "EGP",
    fees: [{ kind: "tuition", amount: 1500 }],
    decisionsOn: "",
    offerDays: 14,
    ageCutoffOn: "2027-10-01",
    minAgeMonths: null,
    maxAgeMonths: null,
    priorities: [],
    letters: {},
  });
  const applying = await browser.newContext();
  const applicant = await applying.newPage();
  const email = `self.${crypto.randomUUID().slice(0, 6)}@example.com`;
  await applicant.clock.install();
  await applicant.goto(`${at}/register`);
  await applicant.getByRole("textbox", { name: "First name" }).fill("Salama");
  await applicant.getByRole("textbox", { name: "Family name" }).fill("Ashoush");
  await applicant.getByRole("textbox", { name: "Email" }).fill(email);
  await applicant.clock.fastForward(5000);
  await applicant
    .getByRole("button", { name: "Register", exact: true })
    .click();
  await expect(
    applicant.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  const link = /\/welcome#([A-Za-z0-9_-]{43})/.exec(
    (await sentTo(email, "/welcome#"))?.text ?? "",
  )?.[1];
  if (!link) throw new Error("no registration link was sent");
  await applicant.goto(`${at}/welcome#${link}`);
  await applicant.getByLabel("New password").fill(PASSWORD);
  await applicant.getByLabel("Type it again").fill(PASSWORD);
  await applicant.getByRole("button", { name: "Save password" }).click();
  await expect(
    applicant.getByRole("status").filter({ hasText: "Password saved" }),
  ).toBeVisible();
  await applicant.goto(`${at}/sign-in?redirect=/apply`);
  await applicant.getByRole("textbox", { name: "Email" }).fill(email);
  await applicant.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await applicant.getByRole("button", { name: "Sign In", exact: true }).click();
  await applicant.waitForURL(`${at}/apply`);
  found.push(...(await familyWords(applicant, `${at}/apply`, "en")));
  await applicant
    .getByRole("button", { name: "Start the application" })
    .click();
  await expect(
    applicant.getByRole("heading", { name: "Applicant", exact: true }),
  ).toBeVisible();
  const steps = applicant.getByRole("navigation", {
    name: "Steps of the application",
  });
  await expect(steps).not.toContainText("Family");
  const application = new URL(applicant.url()).searchParams.get("application");
  found.push(...(await familyWords(applicant, applicant.url(), "en")));
  await applicant.waitForLoadState("networkidle");
  await applicant.getByLabel("Date of birth").fill("2000-03-01");
  await applicant.getByRole("combobox", { name: "Sex" }).click();
  await applicant.getByRole("option", { name: "Male", exact: true }).click();
  await expect(applicant.getByLabel("Date of birth")).toHaveValue("2000-03-01");
  await applicant.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    applicant.getByRole("heading", { name: "Schools before" }),
  ).toBeVisible();
  const schools = `${at}/apply?application=${application ?? ""}&step=schools`;
  found.push(...(await familyWords(applicant, schools, "en")));
  await applying.addCookies([{ name: "language-tag", value: "ar", url: at }]);
  for (const path of [
    `${at}/apply?application=${application ?? ""}&step=child`,
    schools,
  ])
    found.push(...(await familyWords(applicant, path, "ar")));
  await applying.close();
  expect(found).toEqual([]);
});

test("a school's sign-in and registration keep their families' words where it keeps families", async ({
  page,
}) => {
  const at = portal("northwind");
  await page.goto(`${at}/sign-in`);
  await expect(
    page.getByText("Families, students and staff sign in here", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto(`${at}/register`);
  await expect(
    page.getByText("Create your family's account once.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "My child, or someone in my care" }),
  ).toBeVisible();
  await page.goto(`${at}/apply`);
  await expect(
    page.getByText("Your application is kept in your family's account", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .context()
    .addCookies([{ name: "language-tag", value: "ar", url: at }]);
  await page.goto(`${at}/sign-in`);
  await expect(
    page.getByText("يدخل أولياء الأمور والطلاب والعاملون من هنا", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto(`${at}/register`);
  await expect(
    page.getByText("أنشئوا حساب أسرتكم مرة واحدة", { exact: false }),
  ).toBeVisible();
});

test("a school without admissions or badges answers their pages before sign-in as not found", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, {
    without: ["admissions", "badges"],
  });
  const at = portal(school.slug);
  for (const path of ["/apply", "/register", "/badge"]) {
    await page.goto(`${at}${path}`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  }
});
