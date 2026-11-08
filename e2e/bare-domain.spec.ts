import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { BARE, PASSWORD, portal, signInWith } from "./fixtures/sign-in";

// The bare portal domain (localhost in the gate) signs nobody in itself: it
// finds a person's school from their email once the password is right and
// hands the sign-in to that school's own portal, <school>.localhost.

async function emailFirst(page: Page, email: string, password: string) {
  await page.goto(`${BARE}/sign-in`);
  const name = page.getByRole("textbox", { name: "Email or sign-in name" });
  await expect(name).toBeEnabled();
  await name.fill(email);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
}

test("signing in on the bare domain asks for the email, then the password, and lands on the school's portal", async ({
  page,
}) => {
  await page.goto(`${BARE}/sign-in`);
  await expect(page.getByRole("textbox", { name: /school/i })).toHaveCount(0);
  await emailFirst(page, "principal.northwind@northwind.example.com", PASSWORD);
  await page.waitForURL(`${portal()}/today`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The handoff left the address bar with the page that spent it.
  expect(new URL(page.url()).hash).toBe("");

  // The bare domain remembers the school and sends the visitor straight on.
  await page.goto(`${BARE}/sign-in`);
  await page.waitForURL(`${portal()}/today`);
});

test("a wrong password and a name nobody holds read the same, and only after the password", async ({
  page,
}) => {
  for (const email of [
    "parent1001@northwind.example.com",
    "nobody.at.all@example.org",
  ]) {
    await emailFirst(page, email, "not the password");
    await expect(page.getByRole("alert")).toHaveText(
      /wrong email or password/i,
    );
    await expect(page).toHaveURL(`${BARE}/sign-in`);
  }
});

test("a remembered school goes straight to its portal, and another account starts again", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "farida-school", value: "northwind-east", url: BARE },
  ]);
  await page.goto(`${BARE}/sign-in`);
  await expect(page).toHaveURL(`${portal("northwind-east")}/sign-in`);
  await page.getByRole("link", { name: "Use another account" }).click();
  await expect(page).toHaveURL(`${BARE}/sign-in`);
  await expect(
    page.getByRole("textbox", { name: "Email or sign-in name" }),
  ).toBeVisible();

  await page.goto(`${BARE}/students`);
  await expect(page).toHaveURL(new RegExp(`^${BARE}/sign-in\\?redirect=`));
  await context.addCookies([
    { name: "farida-school", value: "northwind", url: BARE },
  ]);
  await page.goto(`${BARE}/students`);
  await expect(page).toHaveURL(new RegExp(`^${portal()}/sign-in\\?redirect=`));
});

test("a forgotten password asked for on the bare domain answers the same for any name", async ({
  page,
}) => {
  await page.goto(`${BARE}/forgot-password`);
  const name = page.getByLabel("Email or sign-in name");
  await expect(name).toBeEnabled();
  await name.fill("nobody.at.all@example.org");
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
});

test("a link sent before schools had their own portal opens on the school's portal", async ({
  page,
}) => {
  await page.goto(`${BARE}/welcome?school=northwind#${"x".repeat(43)}`);
  await expect(page.getByRole("alert")).toHaveText("This link no longer works");
  await expect(page).toHaveURL(`${portal()}/welcome`);

  await page.goto(`${BARE}/badge?school=northwind-east#${"x".repeat(43)}`);
  await expect(page.getByRole("alert")).toHaveText(
    "This badge does not work any more. Ask your teacher for a new one.",
  );
  await expect(page).toHaveURL(`${portal("northwind-east")}/badge`);
});

test("a session the bare domain still holds is signed out and its cookie removed", async ({
  page,
  context,
}) => {
  await signInWith(
    page,
    "parent1001@northwind.example.com",
    PASSWORD,
    "/family",
  );
  const session = (await context.cookies(portal())).find(
    (cookie) => cookie.name === "s-northwind",
  );
  expect(session).toBeDefined();
  await context.addCookies([
    { name: "s-northwind", value: session?.value ?? "", url: BARE },
  ]);

  const response = await page.goto(`${BARE}/sign-in`);
  expect(response?.status()).toBe(200);
  expect(
    (await context.cookies(BARE)).map((cookie) => cookie.name),
  ).not.toContain("s-northwind");
  // The same token was the portal's session, and it is gone there too.
  await page.goto(`${portal()}/family`);
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
});
