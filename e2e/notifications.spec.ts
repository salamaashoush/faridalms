import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001/v1";

async function signIn(
  request: APIRequestContext,
  email: string,
  school = "northwind",
) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school, email, password: "northwind1234" },
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
              format: 0,
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

async function notificationsFor(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const response = await request.post(`${origin}/getNotifications`, {
    headers,
    data: { page: 1 },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    unread: number;
    rows: {
      id: string;
      type: string;
      readAt: string | null;
      path: string;
      payload: { title: string; preview: string };
    }[];
  };
}

interface AuditRow {
  channel: string;
  state: string;
  address: string | null;
  attempts: number;
  lastError: string | null;
  notification: {
    type: string;
    payload: { title: string };
    recipient: { name: string };
  };
}

/** Walks every page of the log, since parallel runs fill it quickly. */
async function findAuditRow(
  request: APIRequestContext,
  headers: Record<string, string>,
  filter: Record<string, string>,
  predicate: (row: AuditRow) => boolean,
): Promise<AuditRow | undefined> {
  for (let page = 1; page <= 40; page += 1) {
    const response = await request.post(`${origin}/getNotificationAudit`, {
      headers,
      data: { page, ...filter },
    });
    expect(response.status()).toBe(200);
    const data = (await response.json()) as { rows: AuditRow[]; pages: number };
    const found = data.rows.find(predicate);
    if (found) return found;
    if (page >= data.pages) return undefined;
  }
  return undefined;
}

test("domain events reach the right people on the channels they allow, with an audit", async ({
  request,
}) => {
  const [admin, sara, parent, omar, norhan, acme] = await Promise.all([
    signIn(request, "admin@example.com"),
    signIn(request, "sara@example.com"),
    signIn(request, "parent@example.com"),
    signIn(request, "omar@example.com"),
    signIn(request, "teacher@example.com"),
    signIn(request, "admin@example.com", "acme"),
  ]);
  const preferences = await request.post(
    `${origin}/saveNotificationPreferences`,
    {
      headers: parent,
      data: {
        email: true,
        sms: true,
        locale: "ar",
        mutedTypes: ["newsletter_published"],
      },
    },
  );
  expect(await preferences.json()).toMatchObject({ locale: "ar", sms: true });
  const studentPreferences = await request.post(
    `${origin}/saveNotificationPreferences`,
    {
      headers: omar,
      data: { email: false, sms: false, locale: "en", mutedTypes: [] },
    },
  );
  expect(studentPreferences.status()).toBe(200);

  const contextResponse = await request.post(`${origin}/getAuthoringContext`, {
    headers: sara,
    data: {},
  });
  const context = (await contextResponse.json()) as {
    classId: string;
    classes: { authoringSubjects: { id: string }[] }[];
  };
  const subjectId = context.classes[0]?.authoringSubjects[0]?.id ?? "";
  const overview = await request.post(`${origin}/getTeachingOverview`, {
    headers: sara,
  });
  const { today } = (await overview.json()) as { today: string };
  const title = `Salama notified work ${crypto.randomUUID().slice(0, 8)}`;
  const created = await request.post(`${origin}/createAssignment`, {
    headers: sara,
    data: {
      classId: context.classId,
      subjectId,
      title,
      description: "Read and summarise.",
      dueDate: today,
      maxScore: 10,
    },
  });
  expect(created.status()).toBe(200);
  const { id: assignmentId } = (await created.json()) as { id: string };

  const parentAfter = await notificationsFor(request, parent);
  const parentRow = parentAfter.rows.find(
    (row) => row.type === "assignment_published" && row.payload.title === title,
  );
  expect(parentRow).toBeTruthy();
  expect(parentRow?.path).toBe(`/assignments/${assignmentId}`);
  expect(parentRow?.readAt).toBeNull();
  expect(parentAfter.unread).toBeGreaterThan(0);
  const studentAfter = await notificationsFor(request, omar);
  expect(
    studentAfter.rows.some(
      (row) =>
        row.type === "assignment_published" && row.payload.title === title,
    ),
  ).toBe(true);
  const otherTeacher = await notificationsFor(request, norhan);
  expect(otherTeacher.rows.some((row) => row.payload.title === title)).toBe(
    false,
  );
  const foreign = await notificationsFor(request, acme);
  expect(foreign.rows.some((row) => row.payload.title === title)).toBe(false);

  const marked = await request.post(`${origin}/markNotificationsRead`, {
    headers: parent,
    data: { ids: [parentRow?.id] },
  });
  expect(marked.status()).toBe(200);
  const parentRead = await notificationsFor(request, parent);
  expect(
    parentRead.rows.find((row) => row.id === parentRow?.id)?.readAt,
  ).not.toBeNull();
  const stillUnreadForStudent = await notificationsFor(request, omar);
  expect(
    stillUnreadForStudent.rows.find((row) => row.payload.title === title)
      ?.readAt,
  ).toBeNull();

  await expect
    .poll(
      async () => {
        const row = await findAuditRow(
          request,
          admin,
          { channel: "email", q: title },
          (entry) =>
            entry.notification.recipient.name === "Salama Ashoush" &&
            entry.state === "sent",
        );
        return row?.attempts;
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  const parentSms = await findAuditRow(
    request,
    admin,
    { channel: "sms", q: title },
    (row) => row.notification.recipient.name === "Salama Ashoush",
  );
  expect(parentSms).toMatchObject({
    state: "skipped",
    lastError: "no_address",
  });
  const studentEmail = await findAuditRow(
    request,
    admin,
    { channel: "email", q: title },
    (row) => row.notification.recipient.name === "Omar Ashoush",
  );
  expect(studentEmail).toMatchObject({
    state: "skipped",
    lastError: "disabled",
  });
  const denied = await request.post(`${origin}/getNotificationAudit`, {
    headers: parent,
    data: { page: 1 },
  });
  expect(denied.status()).toBe(403);

  const retryEmail = `fail-once-${crypto.randomUUID().slice(0, 6)}@example.com`;
  const createdTeacher = await request.post(`${origin}/saveUser`, {
    headers: admin,
    data: {
      name: "Salama Retry Teacher",
      email: retryEmail,
      role: "teacher",
      password: "school-account-2026",
      isActive: true,
      mobile: "+20 100 000 0009",
    },
  });
  expect(createdTeacher.status()).toBe(200);
  const retryTeacher = await request.post(`${origin}/auth/signIn`, {
    data: {
      school: "northwind",
      email: retryEmail,
      password: "school-account-2026",
    },
  });
  expect(retryTeacher.status()).toBe(200);
  const norhanAgain = {
    authorization: `Bearer ${((await retryTeacher.json()) as { token: string }).token}`,
  };
  const norhanPreferences = await request.post(
    `${origin}/saveNotificationPreferences`,
    {
      headers: norhanAgain,
      data: { email: true, sms: true, locale: "en", mutedTypes: [] },
    },
  );
  expect(norhanPreferences.status()).toBe(200);
  const announcementId = crypto.randomUUID();
  const announcementTitle = `Salama notice ${announcementId.slice(0, 8)}`;
  const draft = await request.post(`${origin}/saveAnnouncement`, {
    headers: admin,
    data: {
      id: announcementId,
      expectedRevision: 0,
      title: announcementTitle,
      document: paragraph("The library opens an hour earlier from Sunday."),
      audience: "teachers",
    },
  });
  expect(draft.status()).toBe(200);
  const hidden = await request.post(`${origin}/getAnnouncement`, {
    headers: norhanAgain,
    data: { id: announcementId },
  });
  expect(hidden.status()).toBe(404);
  const published = await request.post(`${origin}/publishAnnouncement`, {
    headers: admin,
    data: { id: announcementId, expectedRevision: 1 },
  });
  expect(published.status()).toBe(200);
  const forParents = await request.post(`${origin}/getAnnouncement`, {
    headers: parent,
    data: { id: announcementId },
  });
  expect(forParents.status()).toBe(404);
  const forTeachers = await request.post(`${origin}/getAnnouncement`, {
    headers: norhanAgain,
    data: { id: announcementId },
  });
  expect(await forTeachers.json()).toMatchObject({
    title: announcementTitle,
    status: "published",
  });
  const teacherNotifications = await notificationsFor(request, norhanAgain);
  expect(
    teacherNotifications.rows.find(
      (row) => row.payload.title === announcementTitle,
    )?.path,
  ).toBe(`/announcements/${announcementId}`);
  await expect
    .poll(
      async () => {
        const row = await findAuditRow(
          request,
          admin,
          { channel: "email", q: retryEmail },
          (entry) =>
            entry.address === retryEmail &&
            entry.notification.payload.title === announcementTitle,
        );
        return row ? `${row.state}:${row.attempts}` : "missing";
      },
      { timeout: 20_000 },
    )
    .toBe("sent:2");
  const smsRow = await findAuditRow(
    request,
    admin,
    { channel: "sms", q: "+20 100 000 0009" },
    (entry) =>
      entry.address === "+20 100 000 0009" &&
      entry.notification.payload.title === announcementTitle,
  );
  expect(smsRow?.state).toBe("sent");

  const yearsResponse = await request.post(`${origin}/getAcademicYears`, {
    headers: admin,
  });
  const years = (await yearsResponse.json()) as {
    id: string;
    isCurrent: boolean;
  }[];
  const newsletterId = crypto.randomUUID();
  const newsletterTitle = `Salama edition ${newsletterId.slice(0, 8)}`;
  const savedNewsletter = await request.post(`${origin}/saveNewsletterDraft`, {
    headers: admin,
    data: {
      id: newsletterId,
      expectedRevision: 0,
      schoolYearId: years.find((year) => year.isCurrent)?.id ?? years[0]?.id,
      title: newsletterTitle,
      summary: "Highlights of the week.",
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
                    content: paragraph("Sports day photos are in."),
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });
  expect(savedNewsletter.status()).toBe(200);
  const edition = await request.post(`${origin}/publishNewsletterDraft`, {
    headers: admin,
    data: { id: newsletterId, expectedRevision: 1, publishedOn: today },
  });
  expect(edition.status()).toBe(200);
  const { id: editionId } = (await edition.json()) as { id: string };
  const readable = await request.post(`${origin}/getNewsletter`, {
    headers: parent,
    data: { id: editionId },
  });
  expect(await readable.json()).toMatchObject({ title: newsletterTitle });
  const parentFinal = await notificationsFor(request, parent);
  const newsletterRow = parentFinal.rows.find(
    (row) => row.payload.title === newsletterTitle,
  );
  expect(newsletterRow?.path).toBe(`/newsletters/${editionId}`);
  const mutedDelivery = await findAuditRow(
    request,
    admin,
    { channel: "in_app", q: newsletterTitle },
    (row) => row.notification.recipient.name === "Salama Ashoush",
  );
  expect(mutedDelivery).toMatchObject({ state: "skipped", lastError: "muted" });
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

test("an announcement written in the editor reaches the bell, the list and the reader", async ({
  page,
  browser,
}) => {
  await login(page, "admin@example.com");
  await page.goto("/admin/announcement-editor");
  const title = `Salama browser notice ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Newsletters", { exact: true }).fill(title);
  await page.getByRole("combobox", { name: /Audience/ }).click();
  await page.getByRole("option", { name: "Parents", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Announcement", exact: true })
    .click();
  await page.keyboard.type("Parent evening moves to Thursday.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/announcements\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await login(family, "parent@example.com");
  const bell = family.getByRole("button", { name: /unread notifications/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await family.getByRole("menuitem", { name: new RegExp(title) }).click();
  await expect(family).toHaveURL(/\/announcements\/[a-f0-9-]+/);
  await expect(
    family.locator("article").getByText("Parent evening moves to Thursday."),
  ).toBeVisible();
  await family.goto("/notifications");
  await expect(family.getByText(title, { exact: true })).toBeVisible();
  await family
    .getByRole("link", { name: "Notification preferences", exact: true })
    .click();
  const sms = family.getByRole("checkbox", { name: "SMS", exact: true });
  const wasChecked = (await sms.getAttribute("aria-checked")) === "true";
  await sms.click();
  await family
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    family.getByText("Saved", { exact: false }).first(),
  ).toBeVisible();
  await family.reload();
  await expect(
    family.getByRole("checkbox", { name: "SMS", exact: true }),
  ).toHaveAttribute("aria-checked", wasChecked ? "false" : "true");
  await family.setViewportSize({ width: 390, height: 844 });
  await family.getByRole("button", { name: "Change language" }).click();
  await family.getByRole("menuitem", { name: "العربية" }).click();
  await expect(family.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await family.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await familyContext.close();
});
