import { test as base, expect } from "@playwright/test";

import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

// The gate's web server answers every *.localhost name: <school>.localhost
// is a school's portal.
const test = base.extend<{ origin: (host: string) => string }>({
  origin: async ({ baseURL }, provide) => {
    const port = new URL(baseURL ?? "http://127.0.0.1").port;
    await provide((host) => `http://${host}${port ? `:${port}` : ""}`);
  },
});

test("a school's portal signs people in on its site's own sign-in page", async ({
  page,
  origin,
}) => {
  await page.goto(`${origin("northwind.localhost")}/sign-in`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Northwind International College",
  );
  await expect(
    page.getByRole("heading", { name: "Need help signing in?" }),
  ).toBeVisible();
  await expect(page.getByText(/office@northwind\.example\.com/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "School code" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Powered by Farida LMS").first()).toBeVisible();

  const login = page.getByRole("textbox", { name: "Email or sign-in name" });
  await expect(login).toBeEnabled();
  await login.fill("parent1001@northwind.example.com");
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/family");
});

test("the portal's page reads in Arabic, right to left", async ({
  page,
  origin,
}) => {
  await page
    .context()
    .addCookies([
      { name: "language-tag", value: "ar", url: origin("northwind.localhost") },
    ]);
  await page.goto(`${origin("northwind.localhost")}/sign-in`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "أهلًا بكم في كلية نورثويند الدولية",
  );
});

test("a site manager makes the sign-in page in the site builder and it shows once published", async ({
  page,
  browser,
  origin,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const signInPage = `${origin("northwind-east.localhost")}/sign-in`;
  await signInWith(
    page,
    "principal.northwind-east@northwind.example.com",
    PASSWORD,
    "/admin",
    "northwind-east",
  );
  await page.goto(`${origin("northwind-east.localhost")}/admin/site`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Edit sign-in page" }).click();
  await expect(page).toHaveURL(/\/admin\/site-page-editor\?id=/);
  await page.getByRole("tab", { name: "Sections" }).click();
  await page
    .getByRole("button", { name: /Sign-in form/ })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill(`Gate ${tag} opens at 7:30`);

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(signInPage);
  // Nothing is published yet: strangers read the builder's starter page.
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
    "Sign in",
  );

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();
  await expect
    .poll(async () => {
      await visitor.goto(signInPage);
      return visitor
        .getByRole("heading", { level: 1, name: `Gate ${tag} opens at 7:30` })
        .count();
    })
    .toBe(1);

  await page.getByRole("button", { name: "More publishing options" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await expect(page.getByText("Visitors no longer see it")).toBeVisible();
  await expect
    .poll(async () => {
      await visitor.goto(signInPage);
      return visitor.getByText(`Gate ${tag} opens at 7:30`).count();
    })
    .toBe(0);
  await visitorContext.close();
});
