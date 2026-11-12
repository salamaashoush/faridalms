import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import type { RoleKey } from "./fixtures/sign-in";

import {
  ACCOUNTS,
  PASSWORD,
  portal,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

/**
 * What the navigation offers on this page, with every section's More
 * opened, since a folded link is offered all the same. The sidebar
 * remembers an opened More, so later pages keep it open.
 */
async function offered(page: Page): Promise<string[]> {
  const folded = page.getByRole("button", {
    name: /^More in /,
    expanded: false,
  });
  while ((await folded.count()) > 0) await folded.first().click();
  return page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter(
          (href): href is string => href !== null && href.startsWith("/"),
        ),
    );
}

/**
 * Opens every link the navigation offers, and every link it offers on the
 * pages those open, such as the pages an area lists beneath its link once
 * it is open.
 */
async function walk(page: Page, open: (href: string) => Promise<void>) {
  const queue = [...new Set(await offered(page))];
  expect(queue.length).toBeGreaterThan(0);
  const seen = new Set(queue);
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    await open(next);
    for (const href of await offered(page))
      if (!seen.has(href)) {
        seen.add(href);
        queue.push(href);
      }
  }
}

/**
 * Navigation is the contract: a role only ever sees links to sections it can
 * actually open. The old portal put four dead links in every page's menu.
 */
test.describe("navigation offers nothing that 404s", () => {
  for (const role of Object.keys(ACCOUNTS) as RoleKey[]) {
    test(`every ${role} nav link resolves`, async ({ page }) => {
      await signIn(page, role);
      await untilHydrated(page);

      await walk(page, async (href) => {
        const response = await page.goto(href);
        expect(response?.status(), `${href} should not error`).toBeLessThan(
          400,
        );
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await untilHydrated(page);
      });
    });
  }
});

/**
 * A school entitled to Basic alone: its menus hold no module it lacks, so
 * nothing it is offered 404s, and a module's page it lacks is not found.
 */
const BASIC: Record<RoleKey, { email: string; home: string }> = {
  admin: { email: "principal.fernhill@fernhill.example.com", home: "/today" },
  teacher: { email: "teacher1.fernhill@fernhill.example.com", home: "/today" },
  parent: { email: "parent1001@fernhill.example.com", home: "/family" },
  student: { email: "student1001@fernhill.example.com", home: "/me" },
};

test.describe("a school with Basic alone offers nothing it does not have", () => {
  for (const role of Object.keys(BASIC) as RoleKey[]) {
    test(`every ${role} nav link resolves`, async ({ page }) => {
      const account = BASIC[role];
      await signInWith(page, account.email, PASSWORD, account.home, "fernhill");
      await untilHydrated(page);
      await walk(page, async (href) => {
        const response = await page.goto(
          new URL(href, portal("fernhill")).href,
        );
        expect(response?.status(), `${href} should not error`).toBeLessThan(
          400,
        );
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Page not found", exact: true }),
          `${href} should be the school's`,
        ).toHaveCount(0);
        await untilHydrated(page);
      });
    });
  }

  test("an administrator finds no module the school lacks", async ({
    page,
  }) => {
    await signInWith(page, BASIC.admin.email, PASSWORD, "/today", "fernhill");
    await untilHydrated(page);
    await offered(page);
    const navigation = page.getByRole("navigation").first();
    for (const name of ["Admissions", "Website", "Standards"])
      await expect(
        navigation.getByRole("link", { name, exact: true }),
      ).toHaveCount(0);
    await page.goto(new URL("/website", portal("fernhill")).href);
    await expect(
      page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
  });
});

test("every tab of a Basic school's records opens", async ({ page }) => {
  await signInWith(page, BASIC.admin.email, PASSWORD, "/today", "fernhill");
  for (const list of ["/students", "/classes", "/staff"]) {
    await page.goto(new URL(list, portal("fernhill")).href);
    await untilHydrated(page);
    const link = page.getByRole("table").getByRole("link").first();
    const record = ((await link.textContent()) ?? "").trim();
    await link.click();
    // The Classes page has tabs of its own; the record's are read once it opens.
    await expect(
      page.getByRole("heading", { level: 1, name: record, exact: true }),
    ).toBeVisible();
    const tabs = page.getByRole("tab");
    await expect(tabs.first()).toBeVisible();
    for (const name of await tabs.allTextContents()) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(
        page.getByRole("tab", { name, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByText(/^(Something went wrong|Page not found)/),
        `${list} ${name}`,
      ).toHaveCount(0);
    }
  }
});

test.describe("roles cannot reach each other's sections", () => {
  const FORBIDDEN: [RoleKey, string][] = [
    ["parent", "/today"],
    ["parent", "/grading"],
    ["student", "/today"],
    ["student", "/family/children"],
    ["teacher", "/staff"],
    ["teacher", "/settings"],
    ["teacher", "/billing"],
    ["parent", "/classes"],
    ["student", "/modules"],
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
    "/family/assignments?studentId=00000000-0000-4000-8000-000000000000",
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
