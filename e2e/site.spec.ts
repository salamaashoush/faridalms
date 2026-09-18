import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

async function signIn(
  request: APIRequestContext,
  school: string,
  email: string,
) {
  const response = await request.post(`${origin}/v1/auth/signIn`, {
    data: { school, email, password: "northwind1234" },
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

const paragraph = (text: string) => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children: [
      {
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        textStyle: "",
        textFormat: 0,
        children: [
          {
            type: "text",
            text,
            format: 0,
            style: "",
            mode: "normal",
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
});

test("the public site shows only published, school-scoped content and schedules posts", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "northwind", "admin@example.com");
  const teacher = await signIn(request, "northwind", "teacher@example.com");

  const site = await request.post(`${origin}/v1/getPublicSite`, {
    data: { school: "northwind" },
  });
  expect(site.status()).toBe(200);
  const home = (await site.json()) as {
    school: { name: string };
    locale: string;
    navigation: { slug: string; group: string }[];
    posts: { slug: string }[];
  };
  expect(home.school.name).toBe("Northwind School");
  expect(home.locale).toBe("en");
  expect(home.navigation).toContainEqual(
    expect.objectContaining({ slug: "welcome-letter", group: "About us" }),
  );
  expect(home.posts.map((post) => post.slug)).not.toContain(
    "reading-week-highlights",
  );
  const arabic = await request.post(`${origin}/v1/getPublicSite`, {
    data: { school: "northwind", locale: "ar" },
  });
  expect(await arabic.json()).toMatchObject({
    locale: "ar",
    home: { title: "مرحباً بكم في كلية غاما الدولية" },
  });
  expect(
    (
      await request.post(`${origin}/v1/getPublicSite`, {
        data: { school: "no-such-school" },
      })
    ).status(),
  ).toBe(404);

  const pageId = crypto.randomUUID();
  const slug = `ferry-${suffix}`;
  const draft = {
    id: pageId,
    expectedRevision: 0,
    slug,
    locale: "en",
    title: `Ferry timetable ${suffix}`,
    summary: "",
    navGroup: "About us",
    navOrder: 9,
    showInNav: true,
    document: {
      version: 1,
      locale: "en",
      sections: [
        {
          id: crypto.randomUUID(),
          tone: "plain",
          columns: [
            {
              id: crypto.randomUUID(),
              blocks: [
                {
                  id: crypto.randomUUID(),
                  type: "content",
                  content: paragraph("Ferries leave every hour."),
                },
              ],
            },
          ],
        },
      ],
    },
  };
  expect(
    (
      await request.post(`${origin}/v1/saveSitePage`, {
        headers: teacher,
        data: draft,
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.post(`${origin}/v1/saveSitePage`, { data: draft })).status(),
  ).toBe(401);
  const saved = await request.post(`${origin}/v1/saveSitePage`, {
    headers: admin,
    data: draft,
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ id: pageId, revision: 1 });
  const hidden = await request.post(`${origin}/v1/getPublicPage`, {
    data: { school: "northwind", slug },
  });
  expect(hidden.status()).toBe(404);
  const stale = await request.post(`${origin}/v1/publishSitePage`, {
    headers: admin,
    data: { id: pageId, expectedRevision: 5 },
  });
  expect(stale.status()).toBe(409);
  const published = await request.post(`${origin}/v1/publishSitePage`, {
    headers: admin,
    data: { id: pageId, expectedRevision: 1 },
  });
  expect(published.status()).toBe(200);
  const visible = await request.post(`${origin}/v1/getPublicPage`, {
    data: { school: "northwind", slug },
  });
  expect(visible.status()).toBe(200);
  expect(await visible.json()).toMatchObject({ title: draft.title });
  expect(
    (
      await request.post(`${origin}/v1/getPublicPage`, {
        data: { school: "acme", slug },
      })
    ).status(),
  ).toBe(404);
  const edited = await request.post(`${origin}/v1/saveSitePage`, {
    headers: admin,
    data: { ...draft, expectedRevision: 2, title: `${draft.title} (editing)` },
  });
  expect(edited.status()).toBe(200);
  expect(
    await (
      await request.post(`${origin}/v1/getPublicPage`, {
        data: { school: "northwind", slug },
      })
    ).json(),
  ).toMatchObject({ title: draft.title });

  const postId = crypto.randomUUID();
  const post = {
    id: postId,
    expectedRevision: 0,
    slug: `harbour-news-${suffix}`,
    locale: "en",
    title: `Harbour news ${suffix}`,
    summary: "The pier reopens.",
    categoryId: null,
    coverFileId: null,
    document: paragraph("The pier reopens on Monday."),
  };
  const created = await request.post(`${origin}/v1/saveSitePost`, {
    headers: admin,
    data: post,
  });
  expect(created.status()).toBe(200);
  const revised = await request.post(`${origin}/v1/saveSitePost`, {
    headers: admin,
    data: { ...post, expectedRevision: 1, title: `${post.title} revised` },
  });
  expect(await revised.json()).toMatchObject({ revision: 2 });
  const history = await request.post(`${origin}/v1/getSitePostRevisions`, {
    headers: admin,
    data: { id: postId },
  });
  expect(
    ((await history.json()) as { revision: number; title: string }[]).map(
      (row) => [row.revision, row.title],
    ),
  ).toEqual([
    [2, `${post.title} revised`],
    [1, post.title],
  ]);
  const scheduled = await request.post(`${origin}/v1/publishSitePost`, {
    headers: admin,
    data: {
      id: postId,
      expectedRevision: 2,
      publishAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });
  expect(scheduled.status()).toBe(200);
  expect(
    (
      await request.post(`${origin}/v1/getPublicPost`, {
        data: { school: "northwind", slug: post.slug },
      })
    ).status(),
  ).toBe(404);
  const backdated = await request.post(`${origin}/v1/publishSitePost`, {
    headers: admin,
    data: {
      id: postId,
      expectedRevision: 3,
      publishAt: new Date(Date.now() - 60 * 1000).toISOString(),
    },
  });
  expect(backdated.status()).toBe(200);
  const article = await request.post(`${origin}/v1/getPublicPost`, {
    data: { school: "northwind", slug: post.slug },
  });
  expect(article.status()).toBe(200);
  expect(await article.json()).toMatchObject({
    title: `${post.title} revised`,
    author: "Layla Fahmy",
  });
  const listed = await request.post(`${origin}/v1/getPublicPosts`, {
    data: { school: "northwind" },
  });
  expect(
    ((await listed.json()) as { rows: { slug: string }[] }).rows.map(
      (row) => row.slug,
    ),
  ).toContain(post.slug);
  expect(
    (
      await request.post(`${origin}/v1/getPublicPost`, {
        data: { school: "acme", slug: post.slug },
      })
    ).status(),
  ).toBe(404);
});

test("visitors browse the site in both languages and administrators publish a page from the designer", async ({
  page,
}) => {
  await page.goto("/site/northwind");
  await expect(
    page.getByRole("heading", {
      name: "Welcome to Northwind School",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "About us" }).click();
  await page.getByRole("menuitem", { name: "Welcome letter" }).click();
  await expect(page).toHaveURL(/\/site\/northwind\/pages\/welcome-letter/);
  await expect(
    page.getByRole("heading", { name: "Welcome letter", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "News", exact: true }).first().click();
  await expect(page).toHaveURL(/\/site\/northwind\/blog/);
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page).toHaveURL(/category=events/);
  await expect(
    page.getByRole("link", { name: "Family day this Thursday", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Admission open for 2026/2027" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Family day this Thursday", exact: true })
    .click();
  await expect(page).toHaveURL(/\/blog\/family-day/);
  await expect(page.getByText("Bring the whole family")).toBeVisible();
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveURL(/lang=ar/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/site/northwind?lang=ar");
  await expect(
    page.getByRole("heading", {
      name: "مرحباً بكم في كلية غاما الدولية",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const missing = await page.goto("/site/northwind/pages/no-such-page");
  expect(missing?.status()).toBe(404);

  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "admin@example.com");
  await page.goto("/admin/site?tab=pages");
  await page.getByRole("link", { name: "New page", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/site-page-editor/);
  const suffix = crypto.randomUUID().slice(0, 8);
  const title = `Pier notice ${suffix}`;
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill(title);
  await page
    .getByRole("textbox", { name: "Address slug", exact: true })
    .fill(`pier-notice-${suffix}`);
  await page
    .getByRole("textbox", { name: "Navigation group", exact: true })
    .fill("Admission");
  await page.getByRole("button", { name: "One column", exact: true }).click();
  await page
    .getByRole("button", { name: "Add text", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Rich text", exact: true })
    .first()
    .click();
  await page.keyboard.type("The pier closes during storms.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/site-page-editor\?id=/);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published to the site")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/tab=pages/);
  await expect(
    page
      .locator("li", { hasText: title })
      .getByText("Published", { exact: true }),
  ).toBeVisible();

  await page.goto(`/site/northwind/pages/pier-notice-${suffix}`);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("The pier closes during storms.")).toBeVisible();
  await page.getByRole("button", { name: "Admission" }).click();
  await expect(page.getByRole("menuitem", { name: title })).toBeVisible();
});
