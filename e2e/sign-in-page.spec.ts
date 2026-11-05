import { test as base, expect } from "@playwright/test";

import { PASSWORD } from "./fixtures/sign-in";

// The gate's web server answers every *.localhost name: <school>.localhost
// is a school's portal.
const test = base.extend<{ origin: (host: string) => string }>({
  origin: async ({ baseURL }, provide) => {
    const port = new URL(baseURL ?? "http://127.0.0.1").port;
    await provide((host) => `http://${host}${port ? `:${port}` : ""}`);
  },
});

test("a school's portal signs people in on its own sign-in page, in its name", async ({
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
