import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { expect, test } from "@playwright/test";

import {
  addPlan,
  asIfOverdue,
  businessDetails,
  createSchool,
  hydrated,
  OWNER,
  schoolAdministrator,
  signInAs,
  unique,
} from "../fixtures/console";
import { sentTo } from "../fixtures/mail";
import { portal, untilHydrated } from "../fixtures/sign-in";

/** A weekday's English name in Cairo, the school's time zone, a number of days from now. */
const cairoWeekday = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Africa/Cairo",
  });

test("an unpaid invoice reminds, asks for a call, restricts the school at its weekend, and is given back when paid", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  await signInAs(page, OWNER);
  await businessDetails(page);
  const planName = `Standard ${unique()}`;
  await addPlan(page, planName);
  const slug = `e2e-${unique()}`;
  const schoolName = `Rowan ${slug}`;
  const billing = `billing@${slug}.example.com`;
  const today = businessToday();
  await createSchool(
    page,
    { slug, nameEn: schoolName, nameAr: "مدرسة الغبيراء" },
    { plan: planName, students: 100, today, ends: addDays(today, 365) },
  );

  // Who looks after the customer, and who receives its invoices.
  await page.goto("/customers");
  await page.getByRole("link", { name: schoolName }).click();
  const owner = page.getByRole("form", { name: "Account owner" });
  await hydrated(owner);
  await owner.getByLabel("Looked after by").selectOption({ label: OWNER.name });
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Account owner saved.")).toBeVisible();
  const contact = page.getByRole("form", { name: "New contact" });
  await contact.getByLabel("Name", { exact: true }).fill("Mona Hassan");
  await contact.getByLabel("Email").fill(billing);
  await contact.getByRole("checkbox", { name: "Billing" }).check();
  await contact.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByRole("article", { name: "Mona Hassan" }),
  ).toBeVisible();
  const customerUrl = page.url();

  // The year's invoice, issued, then a month overdue.
  await page.goto("/subscriptions");
  await page.getByRole("button", { name: "Run the round now" }).click();
  await expect(page.getByText("The round ran.")).toBeVisible({
    timeout: 60_000,
  });
  await page.goto("/billing");
  await page
    .getByRole("region", { name: "Drafts to issue" })
    .getByRole("row", { name: new RegExp(schoolName) })
    .getByRole("link")
    .click();
  await page.getByRole("button", { name: "Issue this invoice" }).click();
  const issued = page.getByText(/^Issued as INV-\d{4}-\d{5}\./);
  await expect(issued).toBeVisible();
  const number = /INV-\d{4}-\d{5}/.exec(
    (await issued.textContent()) ?? "",
  )?.[0];
  if (!number) throw new Error("no invoice number");
  const invoiceUrl = page.url().split("?")[0] ?? "";
  asIfOverdue(number, 31);

  // The school's administrator makes today a weekend day, so the change
  // the clock waits for happens in this run whatever day it is.
  const { page: school, context } = await schoolAdministrator(browser, slug);
  await school.goto(`${portal(slug)}/admin/settings`);
  await untilHydrated(school);
  const profile = school.getByRole("region", { name: "School profile" });
  await profile
    .getByRole("combobox", { name: "First day of the school week" })
    .click();
  await school
    .getByRole("option", { name: cairoWeekday(1), exact: true })
    .click();
  for (const day of [0, 1, 2, 3, 4, 5, 6].map(cairoWeekday)) {
    const box = profile.getByRole("checkbox", { name: day, exact: true });
    if ((day === cairoWeekday(0)) !== (await box.isChecked()))
      await box.click();
  }
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(profile.getByText(/saved/i)).toBeVisible();

  await page.goto("/subscriptions");
  await page.getByRole("button", { name: "Run the round now" }).click();
  await expect(page.getByText("The round ran.")).toBeVisible({
    timeout: 60_000,
  });

  // The billing contact was told, the owner asked to call, the school restricted.
  await sentTo(billing, "can no longer add modules");
  await page.goto("/receivables");
  const row = page
    .getByRole("region", { name: "Owed by age" })
    .getByRole("row", { name: new RegExp(schoolName) });
  await expect(row).toContainText("Restricted");
  await expect(row).toContainText("39,900.00");
  await expect(row).toContainText(`${number}, Access restricted`);
  const calls = page.getByRole("region", { name: "Calls to make" });
  const call = calls
    .getByRole("listitem")
    .filter({ hasText: `Call about ${number}` });
  await expect(call).toContainText(OWNER.name);

  await school.goto(`${portal(slug)}/admin`);
  const notice = school.getByRole("complementary", {
    name: "About your school's plan",
  });
  await expect(notice).toContainText("Your school's account is restricted");
  await expect(notice).toContainText(
    "A payment for your school's plan is overdue",
  );

  // The call made, and the clock paused while the school's approval runs.
  await call
    .getByLabel("What came of it")
    .fill("The bursar is paying this week");
  await call.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Task done.")).toBeVisible();
  await expect(call).toHaveCount(0);
  await page.goto(customerUrl);
  const pause = page.getByRole("form", { name: "Pause the clock" });
  await hydrated(pause);
  await pause.getByLabel("Until").fill(addDays(today, 14));
  await pause.getByLabel("Why").fill("The board approves payments on Thursday");
  await pause.getByRole("button", { name: "Pause the clock" }).click();
  await expect(page.getByText("The clock is paused.")).toBeVisible();
  await page.goto("/receivables");
  await expect(row).toContainText("Paused until");

  // Paid: access back at once, and the notice gone.
  await page.goto("/billing");
  const payment = page.getByRole("form", { name: "Record a payment" });
  await hydrated(payment);
  await payment.getByLabel("From").selectOption({ label: schoolName });
  await payment.getByLabel(/^Amount/).fill("39900");
  await payment.getByLabel("Reference").fill("Transfer 5120");
  await payment.getByLabel(new RegExp(`^${number}:`)).fill("39900");
  await payment.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  await page.goto("/receivables");
  await expect(row).toHaveCount(0);
  await school.reload();
  await expect(
    school.getByRole("complementary", { name: "About your school's plan" }),
  ).toHaveCount(0);

  // The invoice keeps what its clock sent, and to whom.
  await page.goto(invoiceUrl);
  await expect(page.getByRole("region", { name: "Reminders" })).toContainText(
    "Access restricted",
  );
  await expect(page.getByRole("region", { name: "Reminders" })).toContainText(
    billing,
  );
  await context.close();
});
