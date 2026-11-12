import { expect, test } from "@playwright/test";

import { apiAs, signedInApi } from "./fixtures/api";
import { newStudent, refusal } from "./fixtures/school";
import { ACCOUNTS, openWith, signIn, untilHydrated } from "./fixtures/sign-in";

type Api = Awaited<ReturnType<typeof apiAs>>;

/** Who teaches a homeroom and its subject classes. */
async function teachersOf(admin: Api, homeroomId: string) {
  const [keeping, of] = await Promise.all([
    admin.classes.record({ id: homeroomId }),
    admin.homerooms.ofClass({ classId: homeroomId }),
  ]);
  return new Set([
    ...keeping.teachers.map((row) => row.userId),
    ...(of.kind === "homeroom"
      ? of.subjects.flatMap((row) => row.teachers.map((one) => one.userId))
      : []),
  ]);
}

const NOBODY = "00000000-0000-4000-8000-000000000000";

test("people are reachable through the students a viewer teaches or is linked to, and only those", async () => {
  const [admin, teacher, learner, parent] = await Promise.all([
    apiAs("admin"),
    apiAs("teacher"),
    apiAs("student"),
    apiAs("parent"),
  ]);
  const [teacherMe, learnerMe, parentMe] = await Promise.all([
    teacher.identity.currentUser(),
    learner.identity.currentUser(),
    parent.identity.currentUser(),
  ]);
  const [teacherId, learnerId, parentId] = [
    teacherMe.id,
    learnerMe.id,
    parentMe.id,
  ];

  const homeroom = (await teacher.classes.mine({})).rows.find(
    (row) => row.group?.own,
  );
  if (!homeroom) throw new Error("the seeded teacher keeps no homeroom");
  const taught = (await teacher.classes.record({ id: homeroom.id })).roster[0];
  if (!taught) throw new Error("the seeded homeroom has no students");
  const guardian = (await admin.people.student({ id: taught.userId }))
    .guardians?.[0];
  if (!guardian) throw new Error("the seeded student has no guardian");

  const seen = await teacher.people.person({ id: guardian.userId });
  expect(seen.access).toMatchObject({ self: false, manage: false });
  expect(seen.children).toContainEqual(
    expect.objectContaining({ studentId: taught.userId }),
  );

  const stranger = await newStudent(
    admin,
    `Ashoush ${crypto.randomUUID().slice(0, 6)}`,
  );
  const strangerGuardian = (await admin.people.student({ id: stranger.id }))
    .guardians?.[0];
  if (!strangerGuardian) throw new Error("the new student has no guardian");
  expect(
    await refusal(teacher.people.person({ id: stranger.id })),
  ).toMatchObject({ code: "NOT_FOUND" });
  expect(
    await refusal(teacher.people.person({ id: strangerGuardian.userId })),
  ).toMatchObject({ code: "NOT_FOUND" });

  const ownClass = (await admin.people.students({ q: "NO1007" })).rows[0]?.group
    ?.classId;
  if (!ownClass) throw new Error("the seeded student has no homeroom");
  const theirTeachers = await teachersOf(admin, ownClass);
  const notTheirs = (await admin.people.staff({ role: ["teacher"] })).rows.find(
    (row) => !theirTeachers.has(row.id),
  );
  if (!notTheirs) throw new Error("every seeded teacher teaches 8A");
  expect(
    await refusal(learner.people.person({ id: notTheirs.id })),
  ).toMatchObject({ code: "NOT_FOUND" });
  const self = await learner.people.person({ id: learnerId });
  expect(self.access.self).toBe(true);
  expect(self.roles.map((role) => role.role)).toContain("student");

  const family = await parent.people.person({ id: parentId });
  expect(family.access).toMatchObject({ self: true, manage: false });
  expect(family.children.length).toBeGreaterThan(0);
  expect(
    await refusal(parent.people.person({ id: guardian.userId })),
  ).toMatchObject({ code: "NOT_FOUND" });

  const office = await admin.people.person({ id: guardian.userId });
  expect(office.access.manage).toBe(true);
  expect(office.contacts?.length).toBeGreaterThan(0);
  expect(office.children.map((child) => child.studentId)).toContain(
    taught.userId,
  );
  expect(await refusal(admin.people.person({ id: NOBODY }))).toMatchObject({
    code: "NOT_FOUND",
  });
  expect(teacherId).not.toBe(guardian.userId);
});

test("staff move between class, student and person records without losing their place", async ({
  page,
}) => {
  await signIn(page, "teacher");
  await page.goto("/classes");
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name: "7A", exact: true })
    .click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
  const classUrl = page.url().split("?")[0] ?? "";
  await expect(
    page.getByRole("heading", { level: 1, name: "7A", exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/tab=students/);
  const pupil = page
    .getByRole("region", { name: "Students" })
    .getByRole("link")
    .first();
  const pupilName = (await pupil.innerText()).trim();
  await pupil.click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: pupilName }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Attendance", exact: true }).click();
  await expect(page).toHaveURL(/tab=attendance/);
  await page.getByRole("tab", { name: "Coursework", exact: true }).click();
  await expect(page).toHaveURL(/tab=coursework/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Coursework", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Family", exact: true }).click();
  await expect(page).toHaveURL(/tab=family/);
  const parentLink = page.getByRole("tabpanel").getByRole("link").first();
  const parentName = (await parentLink.innerText()).trim();
  await parentLink.click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: parentName }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Linked students" })
      .getByRole("link", { name: pupilName }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/tab=family/);
  await expect(
    page.getByRole("tab", { name: "Family", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Enrollment", exact: true }).click();
  await expect(page).toHaveURL(/tab=enrollment/);
  await page
    .getByRole("tabpanel")
    .getByRole("link", { name: "7A", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
  const colleague = page
    .getByRole("region", { name: "Teachers" })
    .getByRole("link")
    .first();
  const colleagueName = (await colleague.innerText()).trim();
  await colleague.click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: colleagueName }),
  ).toBeVisible();

  await page.goto(`${classUrl}?tab=timetable`);
  await untilHydrated(page);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Timetable", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  const missing = await page.goto(`/people/${NOBODY}`);
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goBack();
  await expect(page).toHaveURL(/tab=timetable/);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const language = page.getByRole("menuitem", { name: "Language" });
  const arabic = page.getByRole("menuitem", { name: "العربية" });
  await openWith(
    page.getByRole("button", { name: "Account", exact: true }),
    language,
  );
  await openWith(language, arabic);
  // The submenu moves while it opens, so the item is chosen from the keyboard
  // rather than by a pointer that crosses its trigger on the way.
  await arabic.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("tab", { selected: true })).toHaveText(
    "الجدول الدراسي",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a family's own record names each linked child and links nowhere that is not found", async ({
  page,
}) => {
  const parent = await apiAs("parent");
  const me = await parent.identity.currentUser();
  const { children } = await parent.people.person({ id: me.id });
  expect(children.length).toBeGreaterThan(0);
  await signIn(page, "parent");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${me.id}`));
  const linked = page.getByRole("region", { name: "Linked students" });
  await Promise.all(
    children.map((child) =>
      expect(linked).toContainText(child.fullNameEn ?? ""),
    ),
  );
  const hrefs = await linked
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  const statuses = await Promise.all(
    hrefs.map(async (href) => [href, (await page.request.get(href)).status()]),
  );
  for (const [href, status] of statuses)
    expect(status, `${href} should open`).toBeLessThan(400);
});

test("a student reaches their own record from the user menu", async ({
  page,
}) => {
  const { api } = await signedInApi(ACCOUNTS.student.email);
  const me = await api.identity.currentUser();
  await signIn(page, "student");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${me.id}`));
  await expect(
    page.getByRole("heading", { level: 1, name: me.nameEn ?? "" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL(/tab=account/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Account", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a teacher's record lists what they teach, and their students' records name them as homeroom teacher", async ({
  page,
}) => {
  const [admin, teacher] = await Promise.all([
    apiAs("admin"),
    apiAs("teacher"),
  ]);
  const me = await teacher.identity.currentUser();
  const homeroom = (await teacher.classes.mine({})).rows.find(
    (row) => row.group?.own,
  );
  if (!homeroom) throw new Error("the seeded teacher keeps no homeroom");
  const pupil = (await admin.classes.record({ id: homeroom.id })).roster[0];
  if (!pupil) throw new Error("the seeded homeroom has no students");
  const name = me.nameEn ?? "";

  await signIn(page, "admin");
  await page.goto(`/people/${me.id}`);
  await untilHydrated(page);
  const teaching = page.getByRole("region", { name: "Teaching" });
  await expect(teaching.getByText(/^Classes and subjects in /)).toBeVisible();
  await expect(teaching.getByText("Homeroom teacher")).toBeVisible();
  await teaching
    .getByRole("link", { name: homeroom.titleEn ?? "", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/classes/${homeroom.id}`));

  await page.goto(`/students/${pupil.userId}`);
  await untilHydrated(page);
  await expect(page.getByText("Homeroom teacher:").first()).toBeVisible();
  await page.getByRole("link", { name, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/people/${me.id}`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});

/** The seeded family's first child, and the teacher who keeps that child's homeroom. */
async function childsTeacher() {
  const [admin, parent] = await Promise.all([apiAs("admin"), apiAs("parent")]);
  const me = await parent.identity.currentUser();
  const [child] = (await parent.people.person({ id: me.id })).children;
  if (!child) throw new Error("the seeded parent has no child");
  const { group: homeroom } = await admin.people.student({
    id: child.studentId,
  });
  const teacher = homeroom?.teachers[0];
  if (!homeroom || !teacher)
    throw new Error("the child's homeroom has no teacher");
  return { parent, homeroom, teacher };
}

test("a family opens its child's teacher's limited profile, never the staff record", async ({
  page,
}) => {
  const { parent, homeroom, teacher } = await childsTeacher();
  const profile = await parent.people.profile({ id: teacher.userId });
  expect(profile.teaching?.classes.map((row) => row.id)).toContain(
    homeroom.classId,
  );
  expect(
    await refusal(parent.people.person({ id: teacher.userId })),
  ).toMatchObject({ code: "NOT_FOUND" });

  await signIn(page, "parent");
  await page.goto(`/profiles/${teacher.userId}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: teacher.fullNameEn ?? "" }),
  ).toBeVisible();
  const classes = page.getByRole("region", {
    name: "In your children's classes",
  });
  await expect(classes).toBeVisible();
  await expect(classes.getByRole("link")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Roles at this school" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Contact details" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Send a message" })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    teacher.fullNameEn ?? "",
  );

  const record = await page.request.get(`/people/${teacher.userId}`);
  expect(record.status()).toBe(404);
});

test("a student opens their own teacher's profile, and no other teacher's", async ({
  page,
}) => {
  const [admin, learner] = await Promise.all([
    apiAs("admin"),
    apiAs("student"),
  ]);
  const me = await learner.identity.currentUser();
  const { group: homeroom } = await admin.people.student({ id: me.id });
  const teacher = homeroom?.teachers[0];
  if (!homeroom || !teacher)
    throw new Error("the student's homeroom has no teacher");
  const theirTeachers = await teachersOf(admin, homeroom.classId);
  const other = (await admin.people.staff({ role: ["teacher"] })).rows.find(
    (row) => !theirTeachers.has(row.id),
  );
  if (!other) throw new Error("every seeded teacher teaches 8A");
  expect(await refusal(learner.people.profile({ id: other.id }))).toMatchObject(
    { code: "NOT_FOUND" },
  );

  await signIn(page, "student");
  await page.goto(`/profiles/${teacher.userId}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("region", { name: "In your classes" }),
  ).toBeVisible();
  expect((await page.request.get(`/people/${teacher.userId}`)).status()).toBe(
    404,
  );
});

test("a name in a family's conversation opens that person's profile", async ({
  page,
}) => {
  const parent = await apiAs("parent");
  const me = await parent.identity.currentUser();
  const family = (await parent.messages.inbox({})).rows.find(
    (row) => row.kind === "family",
  );
  if (!family) throw new Error("the seeded family has no conversation");
  const opened = await parent.messages.thread({ id: family.id });
  const other = opened.members.find(
    (row) => row.userId !== null && row.userId !== me.id,
  );
  if (!other?.userId) throw new Error("the conversation has nobody else");
  expect(other.link).toBe("profile");

  await signIn(page, "parent");
  await page.goto(`/family/messages?thread=${family.id}`);
  await untilHydrated(page);
  await page
    .getByRole("button", { name: /People in this conversation/ })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: other.fullNameEn ?? "" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/profiles/${other.userId}`));
  await expect(
    page.getByRole("heading", { level: 1, name: other.fullNameEn ?? "" }),
  ).toBeVisible();
});
