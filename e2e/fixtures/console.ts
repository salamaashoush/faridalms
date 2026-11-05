import type { Page } from "@playwright/test";

import { expect } from "@playwright/test";

import type { StandInPerson } from "../../scripts/e2e-oidc";

import { OIDC_PERSON_COOKIE } from "../../scripts/e2e-oidc";

const oidcOrigin = `http://127.0.0.1:${process.env.E2E_OIDC_PORT ?? "3208"}`;

export const OWNER: StandInPerson = {
  sub: "e2e-owner",
  email: "salama@example.com",
  name: "Salama Ashoush",
};

export const SALES: StandInPerson = {
  sub: "e2e-sales",
  email: "sales@example.com",
  name: "Sam Sales",
};

export const FINANCE: StandInPerson = {
  sub: "e2e-finance",
  email: "finance@example.com",
  name: "Fatma Finance",
};

/** Signs in to the console as a person the identity provider stand-in knows. */
export async function signInAs(page: Page, person: StandInPerson = OWNER) {
  await page.context().addCookies([
    {
      name: OIDC_PERSON_COOKIE,
      value: Buffer.from(JSON.stringify(person)).toString("base64url"),
      url: oidcOrigin,
    },
  ]);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * Creates a school of its own through New school, in the run's cell, so a
 * spec that changes what a school may use never touches the seeded ones.
 * It walks the draft: a new customer, the school, Basic on a trial, its
 * first administrator, the data processing agreement, then creates it.
 * Answers the school's id.
 */
export async function createSchool(
  page: Page,
  school: { slug: string; nameEn: string; nameAr: string },
): Promise<string> {
  await page.goto("/schools/new");
  await page.getByRole("button", { name: "Start a new school" }).click();
  await expect(page.getByRole("form", { name: "Customer" })).toBeVisible();

  await page.getByRole("button", { name: "New customer" }).click();
  const customer = page.getByRole("form", { name: "New customer" });
  await customer.getByLabel("Legal name in English").fill(school.nameEn);
  await customer.getByLabel("Why").fill("Signed up at the fair");
  await customer.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByLabel("Sold to")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Save and continue" }).click();

  const schools = page.getByRole("form", { name: "Schools" });
  await schools
    .getByLabel("Name in English", { exact: true })
    .fill(school.nameEn);
  await schools
    .getByLabel("Name in Arabic", { exact: true })
    .fill(school.nameAr);
  await schools.getByLabel("Address", { exact: true }).fill(school.slug);
  await schools.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("form", { name: "Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("form", { name: "Addresses" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();

  const people = page.getByRole("form", { name: "People" });
  await people.getByLabel("Given name in English").fill("Salama");
  await people.getByLabel("Family name in English").fill("Ashoush");
  await people.getByLabel("Given name in Arabic").fill("سلامة");
  await people.getByLabel("Family name in Arabic").fill("عشوش");
  await people
    .getByLabel("Email", { exact: true })
    .fill(`salama@${school.slug}.example.com`);
  await people.getByRole("button", { name: "Save and continue" }).click();

  const agreements = page.getByRole("form", { name: "Record an acceptance" });
  await agreements
    .getByLabel("Agreement")
    .selectOption({ label: "Data processing agreement" });
  await agreements.getByLabel("Version accepted").fill("2026-11");
  await agreements.getByRole("button", { name: "Record acceptance" }).click();
  await page.getByRole("button", { name: "Create the school" }).click();
  await expect(
    page.getByRole("heading", { name: `${school.nameEn} created` }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Open the school" }).click();
  await expect(page).toHaveURL(/\/schools\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

/** A short random suffix, so what a spec makes is its own. */
export const unique = () => Math.random().toString(36).slice(2, 8);

/** A plan with Basic and coding, priced per student, as the catalogue sells it. */
export async function addPlan(page: Page, name: string) {
  await page.goto("/catalogue");
  await page.getByRole("button", { name: "New plan" }).click();
  const form = page.getByRole("form", { name: "New plan" });
  await form.getByLabel("Code").fill(`e2e_${unique()}`);
  await form.getByLabel("Name in English").fill(name);
  await form.getByLabel("Name in Arabic").fill("الخطة التجريبية");
  await form.getByRole("checkbox", { name: "Coding and blocks" }).check();
  await form.getByLabel("Students", { exact: true }).fill("400");
  await form.getByRole("button", { name: "Add a price" }).click();
  await form.getByLabel("Amount").fill("350");
  await form.getByLabel("Why").fill("The launch catalogue");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Plan saved.")).toBeVisible();
}
