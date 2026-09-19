import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const origin = "http://127.0.0.1:3001/v1";

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

interface Group {
  kind: string;
  total: number;
  rows: { id: string; title: string; snippet: string | null }[];
}

async function find(
  request: APIRequestContext,
  headers: Record<string, string>,
  q: string,
  kind = "all",
  page = 1,
) {
  const response = await request.post(`${origin}/search`, {
    headers,
    data: { q, kind, page },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    groups: Group[];
    page: number;
    pages: number;
  };
}

const titles = (result: { groups: Group[] }, kind: string) =>
  result.groups
    .find((group) => group.kind === kind)
    ?.rows.map((hit) => hit.title) ?? [];

async function rosterOf(
  request: APIRequestContext,
  admin: Record<string, string>,
  name: string,
) {
  const directory = (await (
    await request.post(`${origin}/getAllClasses`, {
      headers: admin,
      data: { q: name },
    })
  ).json()) as { rows: { id: string; name: string }[] };
  const row = directory.rows.find((item) => item.name === name);
  if (!row) throw new Error(`Missing seeded class ${name}`);
  const detail = (await (
    await request.post(`${origin}/getClass`, {
      headers: admin,
      data: { id: row.id },
    })
  ).json()) as {
    roster: { id: string; firstName: string; lastName: string }[];
  };
  return {
    id: row.id,
    roster: detail.roster.map((student) => ({
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
    })),
  };
}

test("search returns only what the viewer's relationships reach and never medical text", async ({
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const sara = await signIn(request, "sara@example.com");
  const norhan = await signIn(request, "teacher@example.com");
  const omar = await signIn(request, "omar@example.com");
  const parent = await signIn(request, "parent@example.com");
  const p1b = await rosterOf(request, admin, "P1-B");
  const prekg = await rosterOf(request, admin, "PreKG-A");
  const [first] = p1b.roster;
  const [other] = prekg.roster;
  if (!first || !other) throw new Error("Seeded rosters are empty");

  expect(titles(await find(request, sara, first.name), "students")).toContain(
    first.name,
  );
  expect(titles(await find(request, sara, other.name), "students")).toEqual([]);
  expect(titles(await find(request, norhan, first.name), "students")).toEqual(
    [],
  );
  expect(titles(await find(request, sara, "P1-B"), "classes")).toEqual([
    "P1-B",
  ]);
  expect(titles(await find(request, sara, "PreKG"), "classes")).toEqual([]);

  const own = await find(request, omar, first.name.slice(0, 2), "students");
  expect(own.groups[0]?.total ?? 0).toBeLessThanOrEqual(1);
  expect(titles(await find(request, omar, other.name), "students")).toEqual([]);
  expect(titles(await find(request, omar, "Layla"), "people")).toContain(
    "Layla Fahmy",
  );
  expect(titles(await find(request, omar, "Norhan"), "people")).toEqual([]);
  expect(
    titles(await find(request, parent, "Ali"), "students").some((title) =>
      title.startsWith("Ali"),
    ),
  ).toBe(true);

  const otherYear = JSON.parse(
    execFileSync("bun", ["e2e/fixtures/academic-year.ts"], {
      encoding: "utf8",
    }),
  ) as { classId: string };
  const adminClasses = await find(request, admin, "Salama", "classes");
  expect(
    adminClasses.groups.flatMap((group) => group.rows.map((hit) => hit.id)),
  ).not.toContain(otherYear.classId);

  expect((await find(request, admin, "Peanuts")).groups).toEqual([]);
  expect((await find(request, sara, "Peanuts")).groups).toEqual([]);

  const page = await find(request, admin, "a", "students", 1);
  expect(page.groups[0]?.rows.length ?? 0).toBeLessThanOrEqual(10);
  expect(page.page).toBe(1);
  if (page.pages > 1) {
    const second = await find(request, admin, "a", "students", 2);
    const firstIds = new Set(page.groups[0]?.rows.map((hit) => hit.id));
    expect(second.groups[0]?.rows.every((hit) => !firstIds.has(hit.id))).toBe(
      true,
    );
  }
  const beyond = await find(request, admin, "a", "students", 999);
  expect(beyond.page).toBe(beyond.pages);
  expect(beyond.groups[0]?.rows.length ?? 0).toBeGreaterThan(0);
  expect(
    (
      await request.post(`${origin}/search`, {
        headers: admin,
        data: { q: "", kind: "all" },
      })
    ).status(),
  ).toBe(400);
});

test("the launcher searches records as you type and opens the full results page", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();

  await page.getByRole("button", { name: "Find a page…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Find a page…" }).fill("P1-B");
  await expect(
    dialog.getByRole("heading", { name: /^Classes · \d+$/ }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /^P1-B/ })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Find a page…" }).press("Enter");
  await expect(page).toHaveURL(/\/search\?.*q=P1-B/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Search" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Classes" }).click();
  await expect(page).toHaveURL(/kind=classes/);
  await page.getByRole("link", { name: /^P1-B/ }).click();
  await expect(page).toHaveURL(/\/classes\//);
  await expect(
    page.getByRole("heading", { level: 1, name: "P1-B" }),
  ).toBeVisible();

  await page.goto("/search?q=Peanuts");
  await expect(
    page.getByText("Nothing you can see matches “Peanuts”."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "ابحث عن صفحة…" }).click();
  await page.getByRole("textbox", { name: "ابحث عن صفحة…" }).fill("P1-B");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /^الفصول · \d+$/ }),
  ).toBeVisible();
});
