import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001/v1";

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}

const paragraph = (text: string, bold = false) => ({
  root: {
    type: "root",
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", version: 1, text, format: bold ? 1 : 0 }],
      },
    ],
  },
});

test("events keep a rich description with a derived plain text and only calendar managers write them", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "admin@example.com");
  const parent = await signIn(request, "parent@example.com");
  const teacher = await signIn(request, "sara@example.com");
  const base = {
    title: `Salama open evening ${suffix}`,
    category: "general",
    startsOn: "2026-11-09",
    endsOn: "2026-11-11",
    provisional: false,
  };
  const rich = await request.post(`${origin}/saveCalendarEvent`, {
    headers: admin,
    data: { ...base, document: paragraph("Doors open at six.", true) },
  });
  expect(rich.status()).toBe(200);
  const event = (await rich.json()) as {
    id: string;
    revision: number;
    description: string | null;
    document: { root: { children: { type: string }[] } } | null;
  };
  expect(event.description).toBe("Doors open at six.");
  expect(event.document?.root.children[0]?.type).toBe("paragraph");

  const legacy = await request.post(`${origin}/saveCalendarEvent`, {
    headers: admin,
    data: {
      ...base,
      title: `Salama legacy ${suffix}`,
      description: "First line\nSecond line",
    },
  });
  expect(legacy.status()).toBe(200);
  const converted = (await legacy.json()) as {
    description: string | null;
    document: { root: { children: unknown[] } } | null;
  };
  expect(converted.document?.root.children).toHaveLength(2);
  expect(converted.description).toBe("First line\nSecond line");

  for (const headers of [parent, teacher]) {
    const refused = await request.post(`${origin}/saveCalendarEvent`, {
      headers,
      data: {
        ...base,
        id: event.id,
        expectedRevision: event.revision,
        document: paragraph("Changed by someone else."),
      },
    });
    expect(refused.status()).toBe(403);
  }
  const calendar = (await (
    await request.post(`${origin}/getCalendar`, {
      headers: parent,
      data: { month: "2026-11" },
    })
  ).json()) as {
    monthEvents: {
      id: string;
      startsOn: string;
      endsOn: string;
      description: string | null;
    }[];
  };
  const seen = calendar.monthEvents.find((row) => row.id === event.id);
  expect(seen).toMatchObject({
    startsOn: "2026-11-09",
    endsOn: "2026-11-11",
    description: "Doors open at six.",
  });
});

test("events are written in the shared editor and opened from the keyboard", async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const title = `Salama science fair ${suffix}`;
  await login(page, "admin@example.com");
  await page.goto("/admin/calendar?month=2026-11&date=2026-11-16");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event title").fill(title);
  await dialog.getByLabel("Starts").fill("2026-11-16");
  await dialog.getByLabel("Ends").fill("2026-11-16");
  await dialog
    .getByRole("textbox", { name: "Details and instructions", exact: true })
    .click();
  await page.keyboard.type("Projects are judged after lunch.");
  await dialog.getByRole("button", { name: "Save event" }).click();
  await expect(dialog).toHaveCount(0);

  const event = page.getByRole("grid").getByRole("button", { name: title });
  await expect(event).toBeVisible();
  await event.focus();
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByText("Projects are judged after lunch."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("a family reads an event's rich details on an Arabic phone without management controls", async ({
  browser,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "admin@example.com");
  const created = await request.post(`${origin}/saveCalendarEvent`, {
    headers: admin,
    data: {
      title: `Salama book week ${suffix}`,
      category: "general",
      startsOn: "2026-11-23",
      endsOn: "2026-11-25",
      provisional: false,
      document: paragraph("Projects are judged after lunch."),
    },
  });
  expect(created.status()).toBe(200);
  const saved = (await created.json()) as { id: string };

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const family = await phone.newPage();
  await login(family, "parent@example.com");
  await phone.addCookies([
    { name: "language-tag", value: "ar", domain: "127.0.0.1", path: "/" },
  ]);
  await family.goto(`/family/calendar?month=2026-11&event=${saved.id}`);
  await expect(family.locator("html")).toHaveAttribute("dir", "rtl");
  const detail = family.getByRole("dialog");
  await expect(
    detail.getByText("Projects are judged after lunch."),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "تعديل الفعالية" }),
  ).toHaveCount(0);
  expect(
    await family.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await phone.close();
});
