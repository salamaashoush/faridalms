import { test as base, expect } from "@playwright/test";

// The gate's web server answers every *.localhost name, as a deployment's
// edge answers the platform's domains: <school>.localhost is a school's
// portal and <school>.site.localhost its website.
const test = base.extend<{
  origin: (host: string) => string;
  website: string;
  portal: string;
}>({
  origin: async ({ baseURL }, provide) => {
    const port = new URL(baseURL ?? "http://127.0.0.1").port;
    await provide((host) => `http://${host}${port ? `:${port}` : ""}`);
  },
  website: async ({ origin }, provide) =>
    provide(origin("northwind.site.localhost")),
  portal: async ({ origin }, provide) => provide(origin("northwind.localhost")),
});

test("a school's website is served from the root of its own host", async ({
  page,
  website,
  portal,
}) => {
  const response = await page.goto(`${website}/`);
  expect(response?.status()).toBe(200);
  expect(await response?.headerValue("set-cookie")).toBeNull();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Site navigation" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Portal sign in" }),
  ).toHaveAttribute("href", `${portal}/sign-in`);

  await page.getByRole("link", { name: "News" }).first().click();
  await expect(page).toHaveURL(`${website}/news`);
  await expect(
    page.getByRole("link", { name: /Welcome back/ }).first(),
  ).toBeVisible();

  const news = await page.goto(`${website}/news`);
  expect(news?.status()).toBe(200);
});

test("the website's own forms work from its host", async ({
  page,
  website,
}) => {
  await page.clock.install();
  await page.goto(`${website}/pages/admissions`);
  await page
    .getByRole("textbox", { name: "Your name" })
    .fill("Northwind family");
  await page.getByRole("textbox", { name: "Email" }).fill("family@example.com");
  await page
    .getByRole("textbox", { name: /Message/ })
    .fill("Is there a place in grade 4 next term?");
  // A person takes a while to fill the form; faster sends are dropped as scripts.
  await page.clock.fastForward(5000);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Thank you. We will reply within two working days."),
  ).toBeVisible();
});

test("nothing but the website answers on its host", async ({
  request,
  website,
}) => {
  for (const path of [
    "/sign-in",
    "/admin/site",
    "/site/northwind",
    "/site/acme/news",
    "/welcome",
  ]) {
    const response = await request.get(`${website}${path}`, {
      maxRedirects: 0,
    });
    expect(response.status(), path).toBe(404);
    expect(response.headers()["set-cookie"], path).toBeUndefined();
  }
});

test("a school's portal names the school, so sign-in does not ask for it", async ({
  page,
  portal,
}) => {
  await page.goto(`${portal}/sign-in`);
  await expect(
    page.getByRole("textbox", { name: "Email or sign-in name" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "School code" })).toHaveCount(
    0,
  );
});

test("a host that names no school is not found", async ({
  request,
  origin,
}) => {
  for (const host of ["nowhere.localhost", "www.localhost", "site.localhost"]) {
    const response = await request.get(`${origin(host)}/`, {
      maxRedirects: 0,
    });
    expect(response.status(), host).toBe(404);
  }
});
