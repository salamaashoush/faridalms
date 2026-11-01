import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { apiAs, apiClient } from "./fixtures/api";
import { ACCOUNTS, portal, signIn, untilHydrated } from "./fixtures/sign-in";

const arabic = JSON.parse(readFileSync("messages/ar.json", "utf8")) as Record<
  string,
  string
>;

/** A staff member with no sign-in yet, for a sign-in to be opened for. */
async function staffWithoutSignIn() {
  const admin = await apiAs("admin");
  const unique = crypto.randomUUID().slice(0, 8);
  const { id } = await admin.people.saveStaff({
    names: {
      en: { given: "Salama", middle: "", family: `Ashoush ${unique}` },
      ar: { given: "سلامة", middle: "", family: "عاشور" },
    },
    email: `salama-${unique}@northwind.example.com`,
    roles: ["teacher"],
  });
  return { admin, id };
}

test("business conflicts carry a code the client turns into the reader's language", async ({
  page,
}) => {
  const { admin, id } = await staffWithoutSignIn();
  await expect(
    admin.people.saveSignIn({
      userId: id,
      loginName: ACCOUNTS.teacher.email,
      password: "school-account-passphrase-2026",
    }),
  ).rejects.toMatchObject({
    status: 409,
    message: "login_identity.login_name_taken",
  });
  await expect(
    apiClient().identity.signIn({
      loginName: ACCOUNTS.admin.email,
      password: "wrong-password-2026",
    }),
  ).rejects.toMatchObject({
    status: 400,
    message: "auth.invalid_credentials",
  });

  await page
    .context()
    .addCookies([{ name: "language-tag", value: "ar", url: portal() }]);
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const login = page.getByRole("textbox", {
    name: arabic.authSignInFormLogin ?? "",
    exact: true,
  });
  await expect(login).toBeEnabled();
  await login.fill(ACCOUNTS.admin.email);
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
    page.getByText(arabic.authInvalidCredentials ?? "").first(),
  ).toBeVisible();
});

test("a sign-in name already in use is refused in the reader's language inside the sign-in sheet", async ({
  page,
}) => {
  const { id } = await staffWithoutSignIn();
  await signIn(page, "admin");
  await page
    .context()
    .addCookies([{ name: "language-tag", value: "ar", url: portal() }]);
  await page.goto(`/people/${id}?tab=account`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await untilHydrated(page);
  await page
    .getByRole("button", { name: arabic.signInCreate ?? "", exact: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: arabic.signInCreate ?? "",
  });
  const login = sheet.getByRole("textbox", {
    name: arabic.accountLoginName ?? "",
    exact: true,
  });
  await login.fill(ACCOUNTS.teacher.email);
  await sheet
    .getByLabel(arabic.signInPassword ?? "", { exact: true })
    .fill("school-account-passphrase-2026");
  await sheet
    .getByRole("button", { name: arabic.commonSave ?? "", exact: true })
    .click();
  await expect(login).toHaveAttribute("aria-invalid", "true");
  await expect(login).toHaveAccessibleDescription(
    arabic.signInLoginTaken ?? "",
  );
  await expect(sheet.getByRole("alert")).toHaveCount(0);

  // An optional field says so beside its label, in the reader's language,
  // and the marker stays out of the control's name.
  await page.goto(`/staff-editor?id=${id}`);
  await untilHydrated(page);
  const mobile = page.getByRole("textbox", {
    name: arabic.familyMobile ?? "",
    exact: true,
  });
  await expect(mobile).toBeVisible();
  await expect(
    page
      .locator('[data-slot="form-field"]', { has: mobile })
      .getByText(arabic.formOptionalSuffix ?? "", { exact: true }),
  ).toBeVisible();
});
