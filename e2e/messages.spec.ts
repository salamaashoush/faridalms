import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001";
const origin = `${api}/v1`;

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const { token } = (await response.json()) as { token: string };
  return { authorization: `Bearer ${token}` };
}

function paragraph(text: string) {
  return {
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      children: [
        {
          type: "paragraph",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          textFormat: 0,
          textStyle: "",
          children: [
            {
              type: "text",
              version: 1,
              format: 1,
              detail: 0,
              mode: "normal",
              style: "",
              text,
            },
          ],
        },
      ],
    },
  };
}

async function upload(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
  body: string,
) {
  const initiated = await request.post(`${origin}/initiateUpload`, {
    headers,
    data: {
      purpose: "message_attachment",
      name,
      mediaType: "application/pdf",
      sizeBytes: Buffer.byteLength(body),
    },
  });
  expect(initiated.status()).toBe(200);
  const { id, uploadPath } = (await initiated.json()) as {
    id: string;
    uploadPath: string;
  };
  const stored = await request.put(`${api}${uploadPath}`, {
    headers: { ...headers, "content-type": "application/pdf" },
    data: body,
  });
  expect(stored.status()).toBe(200);
  return id;
}

test("conversations carry rich text and private attachments with read state per reader", async ({
  request,
}) => {
  const [teacher, parent, student] = await Promise.all([
    signIn(request, "sara@example.com"),
    signIn(request, "parent@example.com"),
    signIn(request, "omar@example.com"),
  ]);
  const profile = await request.post(`${origin}/auth/currentUser`, {
    headers: parent,
  });
  const parentId = ((await profile.json()) as { id: string }).id;
  const attachmentId = await upload(
    request,
    teacher,
    "reading list.pdf",
    "%PDF-1.4 reading list",
  );
  const subject = `Salama reading plan ${crypto.randomUUID().slice(0, 8)}`;
  const emptyRich = await request.post(`${origin}/sendMessage`, {
    headers: teacher,
    data: {
      category: "parents",
      recipientId: parentId,
      subject,
      body: "",
      bodyFormat: "rich",
      document: null,
    },
  });
  expect(emptyRich.status()).toBe(400);
  const sent = await request.post(`${origin}/sendMessage`, {
    headers: teacher,
    data: {
      category: "parents",
      recipientId: parentId,
      subject,
      body: "",
      bodyFormat: "rich",
      document: paragraph("Please read chapter two together."),
      fileIds: [attachmentId],
    },
  });
  expect(sent.status()).toBe(200);
  const { id } = (await sent.json()) as { id: string };

  const inbox = await request.post(`${origin}/getMessages`, {
    headers: parent,
    data: { folder: "inbox", q: subject, page: 1 },
  });
  expect(await inbox.json()).toMatchObject({
    total: 1,
    unread: expect.any(Number),
    rows: [
      {
        id,
        subject,
        counterpartName: "Sara Mahmoud",
        unreadCount: 1,
        messageCount: 1,
        attachmentCount: 1,
        preview: "Please read chapter two together.",
      },
    ],
  });
  const sentFolder = await request.post(`${origin}/getMessages`, {
    headers: teacher,
    data: { folder: "sent", q: subject, page: 1 },
  });
  expect(await sentFolder.json()).toMatchObject({
    rows: [{ id, unreadCount: 0, counterpartName: "Salama Ashoush" }],
  });

  const opened = await request.post(`${origin}/getMessage`, {
    headers: parent,
    data: { id },
  });
  expect(opened.status()).toBe(200);
  expect(await opened.json()).toMatchObject({
    id,
    bodyFormat: "rich",
    body: "Please read chapter two together.",
    attachments: [{ name: "reading list.pdf", file: { id: attachmentId } }],
    participants: [{ name: "Sara Mahmoud" }, { name: "Salama Ashoush" }],
    replies: [],
  });
  const afterOpen = await request.post(`${origin}/getMessages`, {
    headers: parent,
    data: { folder: "inbox", q: subject, page: 1 },
  });
  expect(await afterOpen.json()).toMatchObject({ rows: [{ unreadCount: 0 }] });
  const teacherView = await request.post(`${origin}/getMessage`, {
    headers: teacher,
    data: { id },
  });
  expect(await teacherView.json()).toMatchObject({
    recipients: [{ recipientId: parentId, readAt: expect.any(String) }],
  });

  const replyFile = await upload(
    request,
    parent,
    "ملاحظات.pdf",
    "%PDF-1.4 notes",
  );
  const reply = await request.post(`${origin}/replyMessage`, {
    headers: parent,
    data: {
      id,
      body: "",
      bodyFormat: "rich",
      document: paragraph("We finished it on Tuesday."),
      fileIds: [replyFile],
    },
  });
  expect(reply.status()).toBe(200);
  const { id: replyId } = (await reply.json()) as { id: string };
  const teacherInbox = await request.post(`${origin}/getMessages`, {
    headers: teacher,
    data: { folder: "inbox", q: subject, page: 1 },
  });
  expect(await teacherInbox.json()).toMatchObject({
    rows: [
      {
        id,
        unreadCount: 1,
        messageCount: 2,
        attachmentCount: 2,
        latestSenderName: "Salama Ashoush",
        preview: "We finished it on Tuesday.",
      },
    ],
  });
  const viaReply = await request.post(`${origin}/getMessage`, {
    headers: teacher,
    data: { id: replyId },
  });
  expect(await viaReply.json()).toMatchObject({
    id,
    focusId: replyId,
    replies: [
      {
        id: replyId,
        body: "We finished it on Tuesday.",
        attachments: [{ name: "ملاحظات.pdf" }],
      },
    ],
  });
  const teacherAfter = await request.post(`${origin}/getMessages`, {
    headers: teacher,
    data: { folder: "inbox", q: subject, page: 1 },
  });
  expect(await teacherAfter.json()).toMatchObject({
    rows: [{ unreadCount: 0 }],
  });
  const parentStill = await request.post(`${origin}/getMessages`, {
    headers: parent,
    data: { folder: "inbox", q: subject, page: 1 },
  });
  expect(await parentStill.json()).toMatchObject({
    rows: [{ unreadCount: 0, messageCount: 2 }],
  });

  const download = await request.get(`${api}/v1/files/${replyFile}/content`, {
    headers: teacher,
  });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain(
    "%D9%85%D9%84%D8%A7%D8%AD%D8%B8%D8%A7%D8%AA.pdf",
  );
  const stranger = await request.get(
    `${api}/v1/files/${attachmentId}/content`,
    {
      headers: student,
    },
  );
  expect(stranger.status()).toBe(404);
  const strangerThread = await request.post(`${origin}/getMessage`, {
    headers: student,
    data: { id: replyId },
  });
  expect(strangerThread.status()).toBe(404);
  const foreignFile = await request.post(`${origin}/replyMessage`, {
    headers: teacher,
    data: {
      id,
      body: "",
      bodyFormat: "rich",
      document: paragraph("Borrowing a file"),
      fileIds: [replyFile],
    },
  });
  expect(foreignFile.status()).toBe(400);

  const draftId = crypto.randomUUID();
  const draftFile = await upload(request, teacher, "plan.pdf", "%PDF-1.4 plan");
  const draft = await request.post(`${origin}/saveMessageDraft`, {
    headers: teacher,
    data: {
      id: draftId,
      expectedRevision: 0,
      category: "parents",
      recipientId: parentId,
      subject: `${subject} draft`,
      body: "",
      bodyFormat: "rich",
      document: paragraph("Next week's plan."),
      fileIds: [draftFile],
    },
  });
  expect(draft.status()).toBe(200);
  const reread = await request.post(`${origin}/getMessageDraft`, {
    headers: teacher,
    data: { id: draftId },
  });
  expect(await reread.json()).toMatchObject({
    bodyFormat: "rich",
    files: [{ id: draftFile, name: "plan.pdf" }],
  });
  const delivered = await request.post(`${origin}/sendMessageDraft`, {
    headers: teacher,
    data: { id: draftId, expectedRevision: 1 },
  });
  expect(delivered.status()).toBe(200);
  const { id: deliveredId } = (await delivered.json()) as { id: string };
  const deliveredThread = await request.post(`${origin}/getMessage`, {
    headers: parent,
    data: { id: deliveredId },
  });
  expect(await deliveredThread.json()).toMatchObject({
    body: "Next week's plan.",
    attachments: [{ name: "plan.pdf", file: { id: draftFile } }],
  });
});

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}

test("a teacher composes with formatting and a file, and the family replies in place", async ({
  page,
  browser,
}) => {
  await login(page, "sara@example.com");
  await page.goto("/teach/messages?compose=true");
  await page
    .getByRole("combobox", { name: "Recipient group", exact: true })
    .click();
  await page.getByRole("option", { name: "Parents", exact: true }).click();
  await page.getByRole("combobox", { name: "Send to", exact: true }).click();
  await page.getByRole("option", { name: /Salama Ashoush/ }).click();
  const subject = `Salama thread ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Subject", { exact: true }).fill(subject);
  const body = page.getByRole("textbox", { name: "Message", exact: true });
  await body.click();
  await page.keyboard.type("Reading together builds confidence.");
  await body.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "reading-list.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 salama reading list"),
  });
  await expect(
    page.getByRole("link", { name: "reading-list.pdf", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/folder=sent/);
  await expect(page.locator("article ol strong")).toHaveText(
    "Reading together builds confidence.",
  );
  await expect(page.getByText("Read by 0 of 1", { exact: true })).toBeVisible();
  const threadId = new URL(page.url()).searchParams.get("message") ?? "";

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await login(family, "parent@example.com");
  await family.goto("/family/messages");
  const row = family.getByRole("button", { name: new RegExp(subject) });
  await expect(row).toContainText("1 unread");
  await row.click();
  await expect(family).toHaveURL(new RegExp(`message=${threadId}`));
  await expect(family.locator("article ol strong")).toHaveText(
    "Reading together builds confidence.",
  );
  const attachment = family.getByRole("link", {
    name: "reading-list.pdf",
    exact: true,
  });
  const href = await attachment.getAttribute("href");
  const fetched = await family.request.get(`http://127.0.0.1:3000${href}`);
  expect(fetched.status()).toBe(200);
  expect(await fetched.text()).toBe("%PDF-1.4 salama reading list");
  const composer = family.getByRole("textbox", {
    name: "Your reply",
    exact: true,
  });
  await composer.click();
  await family.keyboard.type("We will start tonight.");
  await family.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    family.getByText("We will start tonight.", { exact: true }),
  ).toBeVisible();
  await expect(family).toHaveURL(new RegExp(`message=${threadId}`));
  await expect(composer).toHaveText("");
  await expect(
    family.getByText("2 messages", { exact: false }).first(),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByText("Read by 1 of 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("We will start tonight.", { exact: true }),
  ).toBeVisible();

  await family.setViewportSize({ width: 390, height: 844 });
  await family.getByRole("button", { name: "Change language" }).click();
  await family.getByRole("menuitem", { name: "العربية" }).click();
  await expect(family.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    family.getByText("We will start tonight.", { exact: true }),
  ).toBeVisible();
  expect(
    await family.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await familyContext.close();
});
