import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const origin = "http://127.0.0.1:3001/v1";
const arabic = JSON.parse(readFileSync("messages/ar.json", "utf8")) as Record<
  string,
  string
>;

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

test("business conflicts carry a code the client turns into the reader's language", async ({
  page,
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const duplicate = await request.post(`${origin}/saveUser`, {
    headers: admin,
    data: {
      name: "Salama Duplicate",
      email: "sara@example.com",
      role: "teacher",
      title: "",
      mobile: "",
      password: "school-account-2026",
      isActive: true,
    },
  });
  expect(duplicate.status()).toBe(409);
  expect(((await duplicate.json()) as { message: string }).message).toBe(
    "management.email_in_use",
  );
  const wrongPassword = await request.post(`${origin}/auth/signIn`, {
    data: {
      school: "northwind",
      email: "admin@example.com",
      password: "wrong-password-2026",
    },
  });
  expect(wrongPassword.status()).toBe(400);
  expect(((await wrongPassword.json()) as { message: string }).message).toBe(
    "auth.invalid_credentials",
  );

  await page
    .context()
    .addCookies([
      { name: "language-tag", value: "ar", domain: "127.0.0.1", path: "/" },
    ]);
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page
    .getByRole("textbox", {
      name: arabic.authSignInFormEmail ?? "",
      exact: true,
    })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", {
      name: arabic.authSignInFormPassword ?? "",
      exact: true,
    })
    .fill("wrong-password-2026");
  await page
    .getByRole("button", {
      name: arabic.authSignInFormSubmit ?? "",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(arabic.authInvalidCredentials ?? ""),
  ).toBeVisible();
});

test("a duplicate email is refused in the reader's language inside the account dialog", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page
    .context()
    .addCookies([
      { name: "language-tag", value: "ar", domain: "127.0.0.1", path: "/" },
    ]);
  await page.goto("/admin/staff");
  await page
    .getByRole("button", {
      name: arabic.managementAddAccount ?? "",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(arabic.adminName ?? "", { exact: true })
    .fill("Salama Duplicate");
  await dialog
    .getByLabel(arabic.adminEmail ?? "", { exact: true })
    .fill("sara@example.com");
  await dialog
    .getByLabel(arabic.managementPassword ?? "", { exact: true })
    .fill("school-account-2026");
  await expect(
    dialog.getByText(arabic.formOptional ?? "").first(),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: arabic.managementSave ?? "", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    arabic.managementEmailInUse ?? "",
  );
});
