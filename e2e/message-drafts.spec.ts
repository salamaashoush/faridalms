import { expect, test } from "@playwright/test";

test("private drafts preserve revisions and concurrent sending creates one message", async ({
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
  const [parent, teacher, otherSchool] = await Promise.all([
    signIn("northwind", "parent@example.com"),
    signIn("northwind", "teacher@example.com"),
    signIn("acme", "admin@example.com"),
  ]);
  const id = crypto.randomUUID();
  const incomplete = {
    id,
    expectedRevision: 0,
    category: "teachers",
    subject: "",
    body: "## Salama draft\n\nUnfinished writing",
    bodyFormat: "markdown",
  };
  const saved = await request.post(`${origin}/saveMessageDraft`, {
    headers: parent,
    data: incomplete,
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({
    id,
    revision: 1,
    body: incomplete.body,
    sentMessageId: null,
  });
  const incompleteSend = await request.post(`${origin}/sendMessageDraft`, {
    headers: parent,
    data: { id, expectedRevision: 1 },
  });
  expect(incompleteSend.status()).toBe(400);
  for (const headers of [teacher, otherSchool]) {
    const denied = await request.post(`${origin}/getMessageDraft`, {
      headers,
      data: { id },
    });
    expect(denied.status()).toBe(404);
    const deniedEdit = await request.post(`${origin}/saveMessageDraft`, {
      headers,
      data: { ...incomplete, expectedRevision: 1 },
    });
    expect(deniedEdit.status()).toBe(404);
    const deniedSend = await request.post(`${origin}/sendMessageDraft`, {
      headers,
      data: { id, expectedRevision: 1 },
    });
    expect(deniedSend.status()).toBe(404);
  }
  const recipientResponse = await request.post(`${origin}/auth/currentUser`, {
    headers: teacher,
  });
  expect(recipientResponse.status()).toBe(200);
  const recipient = (await recipientResponse.json()) as { id: string };
  const subject = `Salama saved draft ${id}`;
  const completed = {
    ...incomplete,
    subject,
    recipientId: recipient.id,
    expectedRevision: 1,
  };
  const edits = await Promise.all(
    ["First edit", "Second edit"].map((body) =>
      request.post(`${origin}/saveMessageDraft`, {
        headers: parent,
        data: { ...completed, body },
      }),
    ),
  );
  expect(
    edits.map((response) => response.status()).toSorted((a, b) => a - b),
  ).toEqual([200, 409]);
  const reread = await request.post(`${origin}/getMessageDraft`, {
    headers: parent,
    data: { id },
  });
  expect(reread.status()).toBe(200);
  const draft = (await reread.json()) as { revision: number; body: string };
  expect(draft.revision).toBe(2);
  expect(["First edit", "Second edit"]).toContain(draft.body);
  const staleSend = await request.post(`${origin}/sendMessageDraft`, {
    headers: parent,
    data: { id, expectedRevision: 1 },
  });
  expect(staleSend.status()).toBe(409);
  const sent = await Promise.all(
    [1, 2].map(() =>
      request.post(`${origin}/sendMessageDraft`, {
        headers: parent,
        data: { id, expectedRevision: 2 },
      }),
    ),
  );
  expect(sent.map((response) => response.status())).toEqual([200, 200]);
  const messages = await Promise.all(
    sent.map((response) => response.json() as Promise<{ id: string }>),
  );
  expect(messages[0]?.id).toBeTruthy();
  expect(messages[0]?.id).toBe(messages[1]?.id);
  const inbox = await request.post(`${origin}/getMessages`, {
    headers: teacher,
    data: { folder: "inbox", q: subject, page: 1 },
  });
  expect(inbox.status()).toBe(200);
  expect(await inbox.json()).toMatchObject({ total: 1 });
  const afterSend = await request.post(`${origin}/getMessageDraft`, {
    headers: parent,
    data: { id },
  });
  expect(await afterSend.json()).toMatchObject({
    sentMessageId: messages[0]?.id,
    body: draft.body,
  });
  const sentEdit = await request.post(`${origin}/saveMessageDraft`, {
    headers: parent,
    data: { ...completed, expectedRevision: 2 },
  });
  expect(sentEdit.status()).toBe(409);
  const directory = await request.post(`${origin}/getMessageDrafts`, {
    headers: parent,
    data: { page: 1 },
  });
  expect(directory.status()).toBe(200);
  const { rows } = (await directory.json()) as { rows: { id: string }[] };
  expect(rows.map((row) => row.id)).not.toContain(id);
});

test("the browser preserves plain-text drafts from API clients", async ({
  page,
  request,
}) => {
  const origin = "http://127.0.0.1:3001/v1";
  const auth = await request.post(`${origin}/auth/signIn`, {
    data: {
      school: "northwind",
      email: "parent@example.com",
      password: "northwind1234",
    },
  });
  expect(auth.status()).toBe(200);
  const { token } = (await auth.json()) as { token: string };
  const headers = { authorization: `Bearer ${token}` };
  const id = crypto.randomUUID();
  const created = await request.post(`${origin}/saveMessageDraft`, {
    headers,
    data: {
      id,
      expectedRevision: 0,
      category: "teachers",
      subject: "Salama plain draft",
      body: "**Literal text**",
      bodyFormat: "plain",
    },
  });
  expect(created.status()).toBe(200);
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("parent@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto(`/family/messages?compose=true&draft=${id}`);
  await expect(page.locator("#compose-body")).toHaveValue("**Literal text**");
  await page.locator("#compose-body").fill("**Literal text** with more words");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  const saved = await request.post(`${origin}/getMessageDraft`, {
    headers,
    data: { id },
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({
    body: "**Literal text** with more words",
    bodyFormat: "plain",
    revision: 2,
  });
  const updateRemote = async (expectedRevision: number, body: string) => {
    const response = await request.post(`${origin}/saveMessageDraft`, {
      headers,
      data: {
        id,
        expectedRevision,
        category: "teachers",
        subject: "Salama plain draft",
        body,
        bodyFormat: "plain",
      },
    });
    expect(response.status()).toBe(200);
  };
  await page.locator("#compose-body").fill("My unsaved version");
  await updateRemote(2, "The other session version");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Review versions", exact: true })
    .click();
  await expect(
    page.getByText("My unsaved version", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The other session version", { exact: true }),
  ).toBeVisible();
  await updateRemote(3, "An even newer saved version");
  await page
    .getByRole("button", { name: "Save my version", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("My unsaved version", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh saved version", exact: true })
    .click();
  await expect(
    page.getByText("An even newer saved version", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save my version", exact: true })
    .click();
  await expect(page.locator("#compose-body")).toHaveValue("My unsaved version");
  const chosen = await request.post(`${origin}/getMessageDraft`, {
    headers,
    data: { id },
  });
  expect(await chosen.json()).toMatchObject({
    revision: 5,
    body: "My unsaved version",
  });
  await page.locator("#compose-body").fill("Text I will discard");
  await updateRemote(5, "The version I will keep");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Review versions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use saved version", exact: true })
    .click();
  await expect(page.locator("#compose-body")).toHaveValue(
    "The version I will keep",
  );
  await page.reload();
  await expect(page.locator("#compose-body")).toHaveValue(
    "The version I will keep",
  );
  const recipientsResponse = await request.post(`${origin}/getRecipients`, {
    headers,
    data: { category: "teachers", q: "" },
  });
  const recipients = (await recipientsResponse.json()) as {
    rows: { id: string }[];
  };
  expect(recipients.rows[0]?.id).toBeTruthy();
  const readyToSend = await request.post(`${origin}/saveMessageDraft`, {
    headers,
    data: {
      id,
      expectedRevision: 6,
      category: "teachers",
      recipientId: recipients.rows[0]?.id,
      subject: "Salama plain draft",
      body: "Delivered text",
      bodyFormat: "plain",
    },
  });
  expect(readyToSend.status()).toBe(200);
  const delivered = await request.post(`${origin}/sendMessageDraft`, {
    headers,
    data: { id, expectedRevision: 7 },
  });
  expect(delivered.status()).toBe(200);
  await page.locator("#compose-body").fill("My follow-up thought");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Review versions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open sent message", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save as a new draft", exact: true })
    .click();
  await expect(page.locator("#compose-body")).toHaveValue(
    "My follow-up thought",
  );
  const newId = new URL(page.url()).searchParams.get("draft");
  expect(newId).toBeTruthy();
  expect(newId).not.toBe(id);
  const copied = await request.post(`${origin}/getMessageDraft`, {
    headers,
    data: { id: newId },
  });
  expect(copied.status()).toBe(200);
  expect(await copied.json()).toMatchObject({
    revision: 1,
    body: "My follow-up thought",
    sentMessageId: null,
  });
  const original = await request.post(`${origin}/getMessageDraft`, {
    headers,
    data: { id },
  });
  expect(await original.json()).toMatchObject({
    revision: 7,
    body: "Delivered text",
  });
});
