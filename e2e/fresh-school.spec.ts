import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import type { FreshSchool } from "./fixtures/fresh-school";

import { hydrated } from "./fixtures/console";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { portal, untilHydrated } from "./fixtures/sign-in";

/**
 * A school the day it is created has no school year, no classes and no
 * timetable. Every page each kind of person can reach there is opened,
 * with every tab, and each must say something: not the error page, and
 * not a title over an empty panel.
 */
test.describe.configure({ mode: "parallel" });

let school: FreshSchool;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  school = await freshSchool(browser);
});

/** Pages reached from elsewhere than the menu. */
const MORE: Record<string, string[]> = {
  admin: ["/notifications", "/search"],
  teacher: ["/year-map", "/notifications", "/search"],
  guardian: ["/notifications"],
  student: ["/notifications"],
};

/**
 * What the main region says once its heading, tabs and navigation are set
 * aside, or null when the page drew no main region at all.
 */
function contentOf(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const copy = main.cloneNode(true) as HTMLElement;
    copy.querySelector("h1")?.closest("header")?.remove();
    for (const element of copy.querySelectorAll(
      "h1, nav, [role=tablist], button, script, style, [hidden]",
    ))
      element.remove();
    return copy.textContent.trim();
  });
}

/** What is wrong with the page in view, if anything. */
async function faultsOf(page: Page, where: string): Promise<string[]> {
  const failed = page.getByRole("heading", { name: "Something went wrong" });
  if (await failed.count()) {
    const details = await page.locator("details pre").first().textContent();
    return [`${where}: error page (${details?.trim() ?? "no details"})`];
  }
  if (await page.getByRole("heading", { name: "Page not found" }).count())
    return [`${where}: not found`];
  const panel = page.getByRole("tabpanel").first();
  const said = async () =>
    (await panel.count())
      ? ((await panel.textContent()) ?? "").trim()
      : await contentOf(page);
  try {
    await expect.poll(said, { timeout: 5_000 }).toBeTruthy();
  } catch {
    return [
      `${where}: ${(await contentOf(page)) === null ? "no page drawn" : "blank"}`,
    ];
  }
  return [];
}

/** Opens a page and waits for it to settle, whatever it turns out to be. */
async function open(page: Page, href: string) {
  await page.goto(new URL(href, portal(school.slug)).href);
  await page.waitForLoadState("networkidle");
}

/** Every tab of the page in view, each of which must say something too. */
async function tabsOf(page: Page, href: string): Promise<string[]> {
  const faults: string[] = [];
  await hydrated(page.locator("main").first());
  const tabs = page.getByRole("main").getByRole("tab");
  const count = await tabs.count();
  for (let index = 1; index < count; index += 1) {
    const tab = tabs.nth(index);
    const name = (await tab.textContent())?.trim() ?? String(index);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await page.waitForLoadState("networkidle");
    const found = await faultsOf(page, `${href} > ${name}`);
    faults.push(...found);
    if (found.length) {
      await open(page, href);
      await hydrated(page.locator("main").first());
    }
  }
  return faults;
}

/**
 * What the navigation offers on the page in view, with every section's
 * More opened, since a folded link is offered all the same.
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
        .filter((href): href is string => href?.startsWith("/") ?? false),
    );
}

/**
 * Opens every page the navigation offers, and those it offers once an
 * area is open, with every tab of each, noting what fails.
 */
async function walk(page: Page, who: keyof typeof MORE) {
  await untilHydrated(page);
  const queue = [...new Set([...(await offered(page)), ...(MORE[who] ?? [])])];
  expect(queue.length).toBeGreaterThan(0);
  const seen = new Set(queue);
  const faults: string[] = [];
  for (let href = queue.shift(); href !== undefined; href = queue.shift()) {
    await open(page, href);
    const found = await faultsOf(page, href);
    faults.push(...found);
    // A page that drew its tabs above a blank panel still has other tabs.
    if (found.some((fault) => !fault.endsWith(": blank"))) continue;
    try {
      faults.push(...(await tabsOf(page, href)));
      for (const next of await offered(page))
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    } catch (error) {
      faults.push(`${href}: ${String(error).split("\n")[0]}`);
    }
  }
  expect(faults, `pages that fail in a new school for the ${who}`).toEqual([]);
}

for (const who of ["admin", "teacher", "guardian", "student"] as const)
  test(`every page a new school's ${who} opens says something`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await signInTo(page, school, who);
    await walk(page, who);
  });

test("a page that needs the year says so, and who sets it up", async ({
  browser,
}) => {
  const teacher = await browser.newPage();
  await signInTo(teacher, school, "teacher");
  await open(teacher, "/year-map");
  await expect(
    teacher.getByRole("heading", { name: "The school year is not set up yet" }),
  ).toBeVisible();
  await expect(
    teacher.getByText(/administrators set up the school year/),
  ).toBeVisible();
  await expect(
    teacher.getByRole("link", { name: "Set up the school year" }),
  ).toHaveCount(0);
  await teacher.close();

  const admin = await browser.newPage();
  await signInTo(admin, school, "admin");
  await open(admin, "/year-map");
  await expect(
    admin.getByRole("heading", { name: "Set up the school year" }),
  ).toBeVisible();
  await admin.getByRole("link", { name: "Set up the school year" }).click();
  await expect(admin).toHaveURL(/\/academic-year-editor$/);
  await admin.close();
});
