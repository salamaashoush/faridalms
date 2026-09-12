import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const PASSWORD = "northwind1234";

const ACCOUNTS = {
  admin: { email: "admin@example.com", home: "/admin" },
  teacher: { email: "teacher@example.com", home: "/teach" },
  parent: { email: "parent@example.com", home: "/family" },
  student: { email: "omar@example.com", home: "/me" },
} as const;

type RoleKey = keyof typeof ACCOUNTS;

export async function signIn(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(`**${account.home}`);
}

test("unauthenticated visitors are redirected to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a protected route preserves the intended destination", async ({
  page,
}) => {
  await page.goto("/family/assignments");
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
});

test("a wrong password is refused without revealing whether the account exists", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill("parent@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("wrongpassword");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/wrong email or password/i)).toBeVisible();
});

for (const role of Object.keys(ACCOUNTS) as RoleKey[]) {
  test(`a ${role} lands on their own home and survives a reload`, async ({
    page,
  }) => {
    await signIn(page, role);
    await expect(page).toHaveURL(new RegExp(ACCOUNTS[role].home));

    // Full reload: proves the sealed session cookie round-trips on a fresh request.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(ACCOUNTS[role].home));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("an authenticated visitor is redirected away from sign-in", async ({
  page,
}) => {
  await signIn(page, "parent");
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/family/);
});

test("a parent cannot reach the administration area", async ({ page }) => {
  await signIn(page, "parent");
  await page.goto("/admin/students");

  // The server refuses the data, so the page must not render a student list.
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("signing out clears the session", async ({ page }) => {
  await signIn(page, "parent");
  await page.getByRole("button", { name: /account menu|user menu/i }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/family");
  await expect(page).toHaveURL(/\/sign-in/);
});
