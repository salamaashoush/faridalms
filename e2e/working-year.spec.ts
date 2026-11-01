import { teachingWeeks } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import type { Api } from "./fixtures/api";

import { apiAs } from "./fixtures/api";
import { newClass, newStudent, newYear, refusal } from "./fixtures/school";
import { portal, signIn, untilHydrated } from "./fixtures/sign-in";

// Browser projects share one school and years may not overlap, so each
// browser keeps years of its own. A year rolled from has to have begun.
const ROLLED = {
  chromium: {
    from: {
      title: "2016–2017 Salama",
      startsOn: "2016-09-11",
      endsOn: "2017-06-15",
    },
    to: {
      title: "2071–2072 Salama",
      startsOn: "2071-09-06",
      endsOn: "2072-06-16",
    },
  },
  firefox: {
    from: {
      title: "2015–2016 Salama",
      startsOn: "2015-09-13",
      endsOn: "2016-06-16",
    },
    to: {
      title: "2073–2074 Salama",
      startsOn: "2073-09-03",
      endsOn: "2074-06-14",
    },
  },
  webkit: {
    from: {
      title: "2014–2015 Salama",
      startsOn: "2014-09-14",
      endsOn: "2015-06-11",
    },
    to: {
      title: "2075–2076 Salama",
      startsOn: "2075-09-08",
      endsOn: "2076-06-18",
    },
  },
} as const;
const CLOSED = {
  chromium: {
    title: "2013–2014 Salama",
    startsOn: "2013-09-08",
    endsOn: "2014-06-12",
  },
  firefox: {
    title: "2012–2013 Salama",
    startsOn: "2012-09-09",
    endsOn: "2013-06-13",
  },
  webkit: {
    title: "2011–2012 Salama",
    startsOn: "2011-09-11",
    endsOn: "2012-06-14",
  },
} as const;
const WIDENED = {
  chromium: {
    title: "2077–2078 Salama",
    startsOn: "2077-09-05",
    endsOn: "2078-06-15",
    widened: "2078-07-15",
  },
  firefox: {
    title: "2079–2080 Salama",
    startsOn: "2079-09-03",
    endsOn: "2080-06-13",
    widened: "2080-07-13",
  },
  webkit: {
    title: "2081–2082 Salama",
    startsOn: "2081-09-07",
    endsOn: "2082-06-17",
    widened: "2082-07-17",
  },
} as const;

async function placement(api: Api, year: string, name: string) {
  const listed = await api.people.students({ year, q: name });
  return {
    year: listed.year?.id,
    classes: listed.rows
      .filter((row) => row.fullNameEn === name)
      .map((row) => row.homeroom?.classId ?? null),
  };
}

test("directories answer for the year asked, refuse an unknown one and place students on that year's dates", async ({
  browserName,
}) => {
  const admin = await apiAs("admin");
  const unique = crypto.randomUUID().slice(0, 6);
  const years = ROLLED[browserName];
  const source = await newYear(admin, years.from);
  const [first, second] = await Promise.all([
    newClass(admin, { yearId: source.id, title: `Salama A ${unique}` }),
    newClass(admin, { yearId: source.id, title: `Salama B ${unique}` }),
  ]);
  const [promoted, other] = await Promise.all([
    newStudent(admin, `Ashoush ${unique}`),
    newStudent(admin, `Ashoush other ${unique}`),
  ]);
  await Promise.all(
    [
      { student: promoted, classId: first.id },
      { student: other, classId: second.id },
    ].map(({ student, classId }) =>
      admin.classes.enrol({
        studentId: student.id,
        classId,
        from: years.from.startsOn,
      }),
    ),
  );

  const own = await admin.classes.directory({ year: source.id });
  expect(own.year).toMatchObject({ id: source.id, lifecycle: "upcoming" });
  expect(own.rows.map((row) => row.id).toSorted()).toEqual(
    [first.id, second.id].toSorted(),
  );
  const working = await admin.classes.directory({ q: first.title });
  expect(working.year?.lifecycle).toBe("current");
  expect(working.rows).toEqual([]);
  expect(
    await refusal(admin.classes.directory({ year: crypto.randomUUID() })),
  ).toMatchObject({ code: "NOT_FOUND" });

  const target = await newYear(admin, years.to);
  const query = { sourceYearId: source.id, targetYearId: target.id };
  const preview = await admin.rollover.preview(query);
  expect(preview.issue).toBeNull();
  const saved = await admin.rollover.save({
    ...query,
    expectedVersion: preview.version,
    plan: preview.plan,
  });
  const outcome = await admin.rollover.apply({
    ...query,
    expectedVersion: saved.version,
  });
  const successor = outcome.classes.find(
    (row) =>
      row.key ===
      preview.plan.classes.find((plan) => plan.sourceClassId === first.id)?.key,
  )?.classId;
  if (!successor) throw new Error("the rollover made no class from A");

  expect(await placement(admin, source.id, promoted.name)).toEqual({
    year: source.id,
    classes: [first.id],
  });
  expect(await placement(admin, target.id, promoted.name)).toEqual({
    year: target.id,
    classes: [successor],
  });
  expect((await placement(admin, "", promoted.name)).classes).toEqual([null]);

  const { years: listed } = await admin.years.directory();
  const version = listed.find((row) => row.id === source.id)?.version;
  if (version === undefined) throw new Error("the source year is not listed");
  await admin.years.lifecycle({
    id: source.id,
    expectedVersion: version,
    action: "close",
  });
  expect(await admin.classes.record({ id: first.id })).toMatchObject({
    year: { id: source.id, lifecycle: "closed" },
    access: { manage: false, enrol: false },
  });
  expect(
    await admin.attendance.classSummary({ classId: first.id }),
  ).toMatchObject({ canRecord: false });
});

test("administrators switch the school year in the class directory and keep it in the address", async ({
  page,
  context,
  browserName,
}) => {
  const admin = await apiAs("admin");
  const year = CLOSED[browserName];
  const created = await newYear(admin, year);
  const kept = await newClass(admin, {
    yearId: created.id,
    title: `Salama closed ${crypto.randomUUID().slice(0, 6)}`,
  });
  const { years } = await admin.years.directory();
  const version = years.find((row) => row.id === created.id)?.version;
  if (version === undefined) throw new Error("the year is not listed");
  await admin.years.lifecycle({
    id: created.id,
    expectedVersion: version,
    action: "close",
  });

  await signIn(page, "admin");
  await page.goto("/admin/classes");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Classes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add class", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^School year/ }).click();
  await page
    .getByRole("menuitemradio", { name: new RegExp(`^${year.title}`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`year=${created.id}`));
  await expect(
    page.getByRole("table").getByRole("link", { name: kept.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add class", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Actions for ${kept.title}` }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("table").getByRole("link", { name: kept.title }),
  ).toBeVisible();

  await page.getByRole("table").getByRole("link", { name: kept.title }).click();
  await expect(page).toHaveURL(new RegExp(`/classes/${kept.id}`));
  await expect(page.getByText("Year closed", { exact: true })).toBeVisible();
  await expect(page.getByText(year.title).first()).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Edit class", exact: true })
      .or(page.getByRole("link", { name: "Edit class", exact: true })),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`year=${created.id}`));
  await expect(
    page.getByRole("table").getByRole("link", { name: kept.title }),
  ).toBeVisible();

  // A closed year's class keeps its registers to read and takes no new one.
  await page.goto(`/classes/${kept.id}?tab=attendance`);
  await expect(page.getByText(/registers? taken this year/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Take register", exact: true }),
  ).toHaveCount(0);

  await page.goto(`/admin/classes?year=${crypto.randomUUID()}`);
  await expect(page.getByText("Page not found")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([
    { name: "language-tag", value: "ar", url: portal() },
  ]);
  await page.goto("/admin/academic-years");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: year.title, exact: true }) });
  await expect(card.getByText("مغلق", { exact: true })).toBeVisible();
  await page.goto(`/admin/classes?year=${created.id}`);
  await expect(
    page.getByRole("link", { name: kept.title }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a new year gets teaching weeks covering its dates and the home page counts only the working year", async ({
  browserName,
}) => {
  const admin = await apiAs("admin");
  const year = WIDENED[browserName];
  const { weekStart } = await admin.school.profile();
  const { id } = await newYear(admin, year);
  const before = await admin.years.record({ id });
  expect(before.calendar.weeks).toBe(
    teachingWeeks(year.startsOn, year.endsOn, 1, weekStart).length,
  );
  await admin.years.save({
    id,
    expectedVersion: before.version,
    titleEn: year.title,
    titleAr: year.title,
    startsOn: year.startsOn,
    endsOn: year.widened,
    terms: [],
  });
  const after = await admin.years.record({ id });
  expect(after.calendar.weeks).toBe(
    teachingWeeks(year.startsOn, year.widened, 1, weekStart).length,
  );
  expect(after.calendar.weeks).toBeGreaterThan(before.calendar.weeks);

  await newClass(admin, {
    yearId: id,
    title: `Salama unstaffed ${crypto.randomUUID().slice(0, 6)}`,
  });
  const [home, directory] = await Promise.all([
    admin.home.admin(),
    admin.classes.directory({}),
  ]);
  expect(home.homerooms).toBe(
    directory.rows.filter((row) => row.teachers.length === 0).length,
  );
});
