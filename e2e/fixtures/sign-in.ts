import type { Page } from "@playwright/test";

import { expect } from "@playwright/test";

export const PASSWORD = "farida-development-password";

export const ACCOUNTS = {
  admin: { email: "principal.northwind@northwind.example.com", home: "/admin" },
  teacher: {
    email: "teacher1.northwind@northwind.example.com",
    home: "/teach",
  },
  parent: { email: "parent1001@northwind.example.com", home: "/family" },
  student: { email: "student1007@northwind.example.com", home: "/me" },
} as const;

export type RoleKey = keyof typeof ACCOUNTS;

export async function signIn(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];
  await signInWith(page, account.email, PASSWORD, account.home);
}

export async function signInWith(
  page: Page,
  email: string,
  password: string,
  home: string,
  school?: string,
) {
  await page.goto("/sign-in");
  if (school) {
    const code = page.getByRole("textbox", { name: "School code" });
    await expect(code).toBeEnabled();
    await code.fill(school);
  }
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(`**${home}`);
}

const LAUNCHER = /^(Search everything|ابحث في كل شيء)$/;

/**
 * Waits until the page is interactive. A click that lands while React is still
 * hydrating the server-rendered page can be dropped, so specs that load a page
 * with `goto` wait for the shell's search button, disabled until hydration.
 */
export async function untilHydrated(page: Page) {
  await expect(
    page.getByRole("button", { name: LAUNCHER }).first(),
  ).toBeEnabled();
}
