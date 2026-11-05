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
 * Answers the school's id.
 */
export async function createSchool(
  page: Page,
  school: { slug: string; nameEn: string; nameAr: string },
): Promise<string> {
  await page.goto("/schools/new");
  await expect(
    page.getByRole("button", { name: "Create school" }),
  ).toBeEnabled();
  await page.getByLabel("Name in English", { exact: true }).fill(school.nameEn);
  await page.getByLabel("Name in Arabic", { exact: true }).fill(school.nameAr);
  await page.getByLabel("Address", { exact: true }).fill(school.slug);
  await page.getByLabel("Given name in English").fill("Salama");
  await page.getByLabel("Family name in English").fill("Ashoush");
  await page.getByLabel("Given name in Arabic").fill("سلامة");
  await page.getByLabel("Family name in Arabic").fill("عشوش");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`salama@${school.slug}.example.com`);
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(
    page.getByRole("heading", { name: "School created" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Open the school" }).click();
  await expect(page).toHaveURL(/\/schools\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}
