import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const PASSWORD = "northwind1234";

const HOME = {
  admin: "/admin",
  teacher: "/teach",
  parent: "/family",
  student: "/me",
} as const;

const EMAIL = {
  admin: "admin@example.com",
  teacher: "teacher@example.com",
  parent: "parent@example.com",
  student: "omar@example.com",
} as const;

type RoleKey = keyof typeof HOME;

async function signIn(page: Page, role: RoleKey) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(EMAIL[role]);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(`**${HOME[role]}`);
}

/**
 * Navigation is the contract: a role only ever sees links to sections it can
 * actually open. The old portal put four dead links in every page's menu.
 */
test.describe("navigation offers nothing that 404s", () => {
  for (const role of Object.keys(HOME) as RoleKey[]) {
    test(`every ${role} nav link resolves`, async ({ page }) => {
      await signIn(page, role);

      const hrefs = await page
        .getByRole("navigation")
        .getByRole("link")
        .evaluateAll((links) =>
          links
            .map((link) => link.getAttribute("href"))
            .filter(
              (href): href is string => href !== null && href.startsWith("/"),
            ),
        );

      expect(hrefs.length).toBeGreaterThan(0);

      for (const href of new Set(hrefs)) {
        const response = await page.goto(href);
        expect(response?.status(), `${href} should not error`).toBeLessThan(
          400,
        );
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      }
    });
  }
});

test.describe("roles cannot reach each other's sections", () => {
  const FORBIDDEN: [RoleKey, string][] = [
    ["parent", "/admin"],
    ["parent", "/teach/grading"],
    ["student", "/admin"],
    ["student", "/family/children"],
    ["teacher", "/admin/staff"],
  ];

  for (const [role, path] of FORBIDDEN) {
    test(`a ${role} is refused ${path}`, async ({ page }) => {
      await signIn(page, role);
      await page.goto(path);

      // Either the router bounces them, or the server refuses the data and the
      // page shows an error. What must not happen is the data rendering.
      const bounced = !page.url().includes(path);
      if (!bounced) {
        await expect(page.getByRole("table")).toHaveCount(0);
      }
    });
  }
});

test("a parent cannot read a student id outside their family", async ({
  page,
}) => {
  await signIn(page, "parent");
  await page.goto(
    "/family/children?studentId=00000000-0000-4000-8000-000000000000",
  );

  // A forged id must be refused, not silently swapped for a child they can see.
  await expect(
    page.getByText(/forbidden|error|not found/i).first(),
  ).toBeVisible();
});

test("signed-out requests to a server route are rejected", async ({
  request,
}) => {
  const response = await request.get("/family");
  // Redirect to sign-in, never a 200 carrying family data.
  expect(
    [302, 303, 307].includes(response.status()) ||
      response.url().includes("sign-in"),
  ).toBe(true);
});
