import type { Locator, Page } from "@playwright/test";

import { expect } from "@playwright/test";

export const PASSWORD = "farida-development-password";

export const ACCOUNTS = {
  admin: { email: "principal.northwind@northwind.example.com", home: "/today" },
  teacher: {
    email: "teacher1.northwind@northwind.example.com",
    home: "/today",
  },
  parent: { email: "parent1001@northwind.example.com", home: "/family" },
  student: { email: "student1007@northwind.example.com", home: "/me" },
} as const;

export type RoleKey = keyof typeof ACCOUNTS;

export async function signIn(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];
  await signInWith(page, account.email, PASSWORD, account.home);
}

const WEB_PORT = process.env.E2E_WEB_PORT ?? "3200";

/**
 * A school's portal on the gate's web server, which answers every
 * *.localhost name. Sessions are host-only, so a page signed in to one
 * school stays on that school's origin.
 */
export const portal = (school = "northwind") =>
  `http://${school}.localhost:${WEB_PORT}`;

/** The bare portal domain, the gate's PORTAL_DOMAIN, which signs nobody in itself. */
export const BARE = `http://localhost:${WEB_PORT}`;

export async function signInWith(
  page: Page,
  email: string,
  password: string,
  home: string,
  school = "northwind",
) {
  const origin = portal(school);
  await page.goto(`${origin}/sign-in`);
  const login = page.getByRole("textbox", { name: "Email" });
  await expect(login).toBeEnabled();
  await login.fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(`${origin}${home}`);
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

/**
 * Clicks until what the click opens shows. A part of the page can hydrate
 * after the shell `untilHydrated` watches, and a click that lands before it
 * is dropped, so the click is repeated while nothing has opened.
 */
export async function openWith(trigger: Locator, shown: Locator) {
  await expect(async () => {
    if (!(await shown.isVisible())) await trigger.click();
    await expect(shown).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** Opens a menu and picks an item, once the menu has really opened. */
export async function chooseFromMenu(trigger: Locator, item: Locator) {
  await openWith(trigger, item);
  await item.click();
}
