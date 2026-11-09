import { expect, test } from "@playwright/test";

import type { RoleKey } from "./fixtures/sign-in";

import { ACCOUNTS, PASSWORD, signIn, untilHydrated } from "./fixtures/sign-in";

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
  const login = page.getByRole("textbox", { name: "Email" });
  await expect(login).toBeEnabled();
  await login.fill("parent1001@northwind.example.com");
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

test("a link to choose a password that the school never sent opens nothing", async ({
  page,
}) => {
  await page.goto(`/welcome#${"x".repeat(43)}`);
  await expect(page.getByRole("alert")).toHaveText("This link no longer works");
  // The secret leaves the address bar as soon as the page has read it.
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("link", { name: "Go to sign-in" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a person's password is not changed without the one they have", async ({
  page,
}) => {
  await signIn(page, "teacher");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Change password" }).click();
  const sheet = page.getByRole("dialog", { name: "Change password" });
  await sheet.getByLabel("Current password").fill("not the password");
  await sheet.getByLabel("New password").fill("a new phrase to sign in with");
  await sheet.getByLabel("Type it again").fill("a new phrase to sign in wiht");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByText("Passwords do not match")).toBeVisible();
  await sheet.getByLabel("Type it again").fill("a new phrase to sign in with");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    sheet.getByText("That is not your current password."),
  ).toBeVisible();
});

test("an authenticated visitor is redirected away from sign-in", async ({
  page,
}) => {
  await signIn(page, "parent");
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/family/);
});

test("a parent cannot reach the administration area", async ({ page }) => {
  await signIn(page, "parent");
  await page.goto("/students");

  // The server refuses the data, so the page must not render a student list.
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("signing out clears the session", async ({ page }) => {
  await signIn(page, "parent");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/family");
  await expect(page).toHaveURL(/\/sign-in/);
});

test.describe("over HTTPS", () => {
  // Behind the production edge every request arrives as HTTPS, and the
  // session cookie takes the __Host- prefix, which a browser changes only
  // by a Secure Set-Cookie.
  test.use({ extraHTTPHeaders: { "x-forwarded-proto": "https" } });

  test("signing out removes the session cookie, not only the session", async ({
    page,
    context,
    browserName,
  }) => {
    // The test serves plain HTTP and asks for HTTPS's cookies; only Chromium
    // keeps a Secure cookie for a localhost host, so only it can stand in.
    test.skip(
      browserName !== "chromium",
      "only Chromium keeps Secure cookies over plain HTTP on localhost",
    );
    await signIn(page, "parent");
    const session = (await context.cookies()).find((cookie) =>
      cookie.name.startsWith("__Host-s-"),
    );
    expect(session).toBeDefined();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByLabel("Email or sign-in name")).toBeVisible();
    expect(
      (await context.cookies()).some((cookie) =>
        cookie.name.startsWith("__Host-s-"),
      ),
    ).toBe(false);
  });
});

test("a forgotten password is asked for from sign-in, and the answer never says whether the name exists", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("textbox", { name: "Email" })).toBeEnabled();
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  const login = page.getByLabel("Email or sign-in name");
  await expect(login).toBeEnabled();
  await login.fill("nobody.at.all@northwind.example.com");
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to sign-in" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("someone sent to sign in from a page goes back to it", async ({
  page,
}) => {
  await page.goto("/students?dir=desc");
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  await page.getByRole("textbox", { name: "Email" }).fill(ACCOUNTS.admin.email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/students\?dir=desc$/);
});
