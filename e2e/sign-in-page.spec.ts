import { test as base, expect } from "@playwright/test";

import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

// The gate's web server answers every *.localhost name: <school>.localhost
// is a school's portal, and 127.0.0.1 the bare portal domain.
const test = base.extend<{ origin: (host: string) => string }>({
  origin: async ({ baseURL }, provide) => {
    const port = new URL(baseURL ?? "http://127.0.0.1").port;
    await provide((host) => `http://${host}${port ? `:${port}` : ""}`);
  },
});

test("a school's portal signs people in inside the school's own page", async ({
  page,
  origin,
}) => {
  await page.goto(`${origin("northwind.localhost")}/sign-in`);
  const school = page.getByRole("complementary", {
    name: "About Northwind International College",
  });
  await expect(
    school.getByRole("heading", {
      name: "Welcome to Northwind International College",
    }),
  ).toBeVisible();
  await expect(
    school.getByText(/office@northwind\.example\.com/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
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
  await expect(
    page.getByRole("heading", { name: "أهلًا بكم في كلية نورثويند الدولية" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "تسجيل الدخول",
  );
});

test("someone who does not know their school's code finds it by name and goes to its portal", async ({
  page,
  origin,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("textbox", { name: "School code" }),
  ).toBeEnabled();
  await page
    .getByRole("link", {
      name: "Don't know your school's code? Find your school",
    })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Find your school" }),
  ).toBeVisible();
  const search = page.getByRole("searchbox", { name: "School name or code" });
  await search.fill("مدرسه نورثويند");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/find-school\?q=/);
  await expect(page.getByText("1 school found")).toBeVisible();
  const result = page.getByRole("link", { name: /Northwind East School/ });
  await expect(result).toHaveAttribute(
    "href",
    `${origin("northwind-east.localhost")}/sign-in`,
  );

  await page.goto("/find-school?q=no%20such%20academy");
  await expect(
    page.getByText(/No school matches “no such academy”/),
  ).toBeVisible();

  await page.goto("/find-school?q=northwind%20east");
  await page.getByRole("link", { name: /Northwind East School/ }).click();
  await expect(page).toHaveURL(`${origin("northwind-east.localhost")}/sign-in`);
  await expect(
    page.getByRole("heading", { name: "Welcome to Northwind East School" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "School code" })).toHaveCount(
    0,
  );
});

test("the finder is the bare domain's: a school's portal sends it to sign-in", async ({
  page,
  origin,
}) => {
  await page.goto(`${origin("northwind.localhost")}/find-school`);
  await expect(page).toHaveURL(`${origin("northwind.localhost")}/sign-in`);
});

test("a site manager writes the sign-in page in the site studio and it shows once published", async ({
  page,
  browser,
  origin,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const portal = `${origin("northwind-east.localhost")}/sign-in`;
  await signInWith(
    page,
    "principal.northwind-east@northwind.example.com",
    PASSWORD,
    "/admin",
    "northwind-east",
  );
  await page.goto("/admin/site");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Edit sign-in page" }).click();
  await expect(page).toHaveURL(/\/admin\/site-sign-in/);
  const body = page.locator("[contenteditable=true]").first();
  await expect(body).toContainText("Welcome to Northwind East School");
  await body.fill(`Gate ${tag} opens at 7:30.`);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(portal);
  // Saved is not published: strangers still read the standard welcome.
  await expect(
    visitor.getByRole("heading", { name: "Welcome to Northwind East School" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("The sign-in page is published")).toBeVisible();
  await expect
    .poll(async () => {
      await visitor.goto(portal);
      return visitor.getByText(`Gate ${tag} opens at 7:30.`).count();
    })
    .toBe(1);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Take down" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Take down" })
    .click();
  await expect(
    page.getByText("The portal shows the standard welcome again"),
  ).toBeVisible();
  await expect
    .poll(async () => {
      await visitor.goto(portal);
      return visitor.getByText(`Gate ${tag} opens at 7:30.`).count();
    })
    .toBe(0);
  await visitorContext.close();
});

test("a link from an email opens in the school's own page on the bare domain", async ({
  page,
}) => {
  await page.goto(`/welcome?school=northwind#${"x".repeat(43)}`);
  await expect(page.getByRole("alert")).toHaveText("This link no longer works");
  await expect(
    page.getByRole("heading", {
      name: "Welcome to Northwind International College",
    }),
  ).toBeVisible();
});
