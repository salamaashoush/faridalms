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
