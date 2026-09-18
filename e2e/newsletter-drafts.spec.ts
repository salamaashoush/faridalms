import { expect, test } from "@playwright/test";

test("newsletter drafts are school-scoped, permission-checked and revision-protected", async ({
  request,
}) => {
  const origin = "http://127.0.0.1:3001/v1";
  const signIn = async (school: string, email: string) => {
    const response = await request.post(`${origin}/auth/signIn`, {
      data: { school, email, password: "northwind1234" },
    });
    expect(response.status()).toBe(200);
    const { token } = (await response.json()) as { token: string };
    return { authorization: `Bearer ${token}` };
  };
  const [admin, parent, teacher, student, otherSchool] = await Promise.all([
    signIn("northwind", "admin@example.com"),
    signIn("northwind", "parent@example.com"),
    signIn("northwind", "teacher@example.com"),
    signIn("northwind", "omar@example.com"),
    signIn("acme", "admin@example.com"),
  ]);
  const yearsResponse = await request.post(`${origin}/getAcademicYears`, {
    headers: admin,
  });
  expect(yearsResponse.status()).toBe(200);
  const years = (await yearsResponse.json()) as { id: string }[];
  const schoolYearId = years[0]?.id;
  expect(schoolYearId).toBeTruthy();
  const input = {
    id: crypto.randomUUID(),
    expectedRevision: 0,
    schoolYearId,
    title: `Salama newsletter ${crypto.randomUUID()}`,
    summary: "",
    document: { version: 1, locale: "ar", sections: [] },
  };
  const created = await request.post(`${origin}/saveNewsletterDraft`, {
    headers: admin,
    data: input,
  });
  expect(created.status()).toBe(200);
  expect(await created.json()).toMatchObject({
    revision: 1,
    document: input.document,
  });
  for (const headers of [parent, teacher, student]) {
    for (const [operation, data] of [
      ["getNewsletterDraft", { id: input.id }],
      ["getNewsletterDrafts", { schoolYearId }],
      ["saveNewsletterDraft", { ...input, expectedRevision: 1 }],
    ] as const) {
      const denied = await request.post(`${origin}/${operation}`, {
        headers,
        data,
      });
      expect(denied.status()).toBe(403);
    }
  }
  const foreignRead = await request.post(`${origin}/getNewsletterDraft`, {
    headers: otherSchool,
    data: { id: input.id },
  });
  expect(foreignRead.status()).toBe(404);
  const foreignYear = await request.post(`${origin}/saveNewsletterDraft`, {
    headers: otherSchool,
    data: { ...input, id: crypto.randomUUID() },
  });
  expect(foreignYear.status()).toBe(404);
  const changes = await Promise.all(
    ["First edit", "Second edit"].map((summary) =>
      request.post(`${origin}/saveNewsletterDraft`, {
        headers: admin,
        data: { ...input, expectedRevision: 1, summary },
      }),
    ),
  );
  expect(
    changes.map((response) => response.status()).toSorted((a, b) => a - b),
  ).toEqual([200, 409]);
  const saved = await request.post(`${origin}/getNewsletterDraft`, {
    headers: admin,
    data: { id: input.id },
  });
  expect(saved.status()).toBe(200);
  const draft = (await saved.json()) as { revision: number; summary: string };
  expect(draft.revision).toBe(2);
  expect(["First edit", "Second edit"]).toContain(draft.summary);
  const published = await request.post(`${origin}/getNewsletters`, {
    headers: parent,
    data: { q: input.title },
  });
  expect(published.status()).toBe(200);
  expect(await published.json()).toMatchObject({ total: 0 });
  const directory = await request.post(`${origin}/getNewsletterDrafts`, {
    headers: admin,
    data: { schoolYearId },
  });
  expect(directory.status()).toBe(200);
  const { rows } = (await directory.json()) as { rows: { id: string }[] };
  expect(rows.map((row) => row.id)).toContain(input.id);
});

test("newsletter designer preserves rich text, layout and saved drafts", async ({
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
  await page.goto("/admin/newsletters");
  await page
    .getByRole("link", { name: "Design a newsletter", exact: true })
    .click();
  const title = `Salama learning news ${crypto.randomUUID()}`;
  await page
    .getByRole("textbox", { name: "Newsletters", exact: true })
    .fill(title);
  await page.getByRole("button", { name: "Two columns", exact: true }).click();
  await page
    .getByRole("button", { name: "Add heading", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Classroom discoveries");
  await page
    .getByRole("button", { name: "Add text", exact: true })
    .last()
    .click();
  const text = page.getByRole("textbox", { name: "Rich text", exact: true });
  await text.fill("Students explored new ideas together.");
  await text.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Classroom discoveries", exact: true }),
  ).toBeVisible();
  await expect(page.locator("article strong")).toHaveText(
    "Students explored new ideas together.",
  );
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(text).toHaveText("Students explored new ideas together.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/newsletter-editor\?id=/);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Newsletters", exact: true }),
  ).toHaveValue(title);
  await expect(
    page
      .getByRole("textbox", { name: "Rich text", exact: true })
      .locator("strong"),
  ).toHaveText("Students explored new ideas together.");
  await expect(
    page.getByText(
      `${"Students explored new ideas together.".length} characters`,
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Unsaved heading");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Heading", exact: true }),
  ).toHaveValue("Unsaved heading");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("link", { name: "Newsletter drafts", exact: true })
    .click();
  await page.getByRole("link", { name: `Edit ${title}`, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Heading", exact: true }),
  ).toHaveValue("Unsaved heading");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unsaved heading", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/admin/newsletter-editor?year=${crypto.randomUUID()}`);
  await expect(page.getByRole("alert")).toHaveText(
    "This school year could not be found.",
  );
});

test("shared content editor saves links, tables and Markdown formatting", async ({
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
  await page.goto("/admin/newsletter-editor");
  await page
    .getByRole("textbox", { name: "Newsletters", exact: true })
    .fill(`Salama content ${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "One column", exact: true }).click();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Rich text", exact: true });
  await editor.click();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown", exact: true })
    .fill(
      "# Learning with Salama\n\nVisit [our guide](https://example.com/guide).\n\n- First activity\n- Second activity\n\n- [x] Completed task\n\n```js\nconst lesson = 1;\n```\n",
    );
  await page
    .getByRole("button", { name: "Replace from Markdown", exact: true })
    .click();
  await expect(
    editor.getByRole("heading", { name: "Learning with Salama", exact: true }),
  ).toBeVisible();
  await expect(editor.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/guide",
  );
  await expect(editor).toContainText("const lesson = 1;");
  await editor.press("ControlOrMeta+End");
  await page.getByRole("button", { name: "Table tools", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Rows", exact: true }).fill("2");
  await page
    .getByRole("spinbutton", { name: "Columns", exact: true })
    .fill("2");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editor.locator("table")).toBeVisible();
  await editor.locator("th, td").first().click();
  await page.keyboard.insertText("Activity");
  await page.getByRole("button", { name: "Table tools", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(editor.locator("tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/newsletter-editor\?id=/);
  await page.reload();
  await expect(editor.locator("tr")).toHaveCount(3);
  await expect(editor).toContainText("Activity");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("article table tr")).toHaveCount(3);
  await expect(page.locator("article a")).toHaveAttribute(
    "href",
    "https://example.com/guide",
  );
  await expect(page.locator("article pre")).toContainText("const lesson = 1;");
  await expect(page.locator('article input[type="checkbox"]')).toBeChecked();
});
