import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

test("an administrator sets the school's record store, its secret never shown again", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/settings?section=records");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { name: "Learning record store" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Store address" })
    .fill("https://lrs.example.com/xapi");
  await page.getByRole("textbox", { name: "Key" }).fill("school-key");
  await page.getByLabel("Secret").fill("s3cret-from-the-store");
  await page.getByRole("checkbox", { name: "Send statements" }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Secret")).toHaveValue("");
  await expect(
    page.getByText(
      "A secret is kept, sealed. Leave this empty to keep it, or write a new one.",
    ),
  ).toBeVisible();
  await expect(page.getByText("s3cret-from-the-store")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sending" })).toBeVisible();

  // Turned off again, so other tests' learning is not queued for a store.
  await page.getByRole("checkbox", { name: "Send statements" }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Send statements" }),
  ).not.toBeChecked();
});

test("an administrator lets a tool read class lists, and starts a tool registering itself", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/settings?section=tools");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add tool", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add tool" });
  const name = `Class list reader ${crypto.randomUUID().slice(0, 6)}`;
  await sheet.getByRole("textbox", { name: "Name" }).fill(name);
  await sheet
    .getByRole("textbox", { name: /^Login initiation address/ })
    .fill("https://tool.example.com/login");
  await sheet
    .getByRole("textbox", { name: /^Launch address/ })
    .fill("https://tool.example.com/launch");
  await sheet
    .getByRole("textbox", { name: /^Public keys address/ })
    .fill("https://tool.example.com/jwks");
  await sheet
    .getByRole("textbox", { name: /^Work review address/ })
    .fill("https://tool.example.com/review");
  await sheet.getByRole("checkbox", { name: "Read class lists" }).check();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText(/\/lti\/openid-configuration$/)).toBeVisible();

  await page
    .getByRole("button", { name: "Register from an address", exact: true })
    .click();
  const register = page.getByRole("dialog", {
    name: "Register from an address",
  });
  await expect(
    register.getByRole("textbox", { name: /^Registration address/ }),
  ).toBeVisible();
});
