import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { expect, test } from "@playwright/test";

import {
  addPlan,
  businessDetails,
  choose,
  createSchool,
  openDraftOf,
  OWNER,
  payByCard,
  recordHeader,
  schoolAdministrator,
  signInAs,
  unique,
} from "../fixtures/console";
import { portal } from "../fixtures/sign-in";

test("a contract is invoiced, paid by transfer and card, credited, and shown to its school", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);
  await businessDetails(page);
  const planName = `Standard ${unique()}`;
  await addPlan(page, planName);
  const slug = `e2e-${unique()}`;
  const schoolName = `Juniper ${slug}`;
  const today = businessToday();
  await createSchool(
    page,
    { slug, nameEn: schoolName, nameAr: "مدرسة العرعر" },
    { plan: planName, students: 100, today, ends: addDays(today, 365) },
  );

  await page.goto("/subscriptions");
  await page.getByRole("button", { name: "Run the round now" }).click();
  await expect(page.getByText("The round ran.")).toBeVisible({
    timeout: 60_000,
  });
  await openDraftOf(page, schoolName);
  // 100 students at 350.00 is 35,000.00, and 14% VAT makes 39,900.00.
  const draft = page.getByRole("article", { name: "Draft invoice" });
  await expect(draft).toContainText("35,000.00");
  await expect(draft).toContainText("39,900.00");
  await page.getByRole("button", { name: "Issue this invoice" }).click();
  await expect(page.getByText(/^Issued as INV-\d{4}-\d{5}\./)).toBeVisible();
  const heading = page.getByRole("heading", { name: /^Invoice INV-/ });
  const number = /INV-\d{4}-\d{5}/.exec(
    (await heading.textContent()) ?? "",
  )?.[0];
  if (!number) throw new Error("no invoice number");
  const invoiceUrl = page.url().split("?")[0] ?? "";

  await page.getByRole("button", { name: "Arabic" }).click();
  const arabic = page.getByRole("article", { name: `فاتورة ${number}` });
  await expect(arabic).toHaveAttribute("dir", "rtl");
  await expect(arabic).toContainText("ضريبة القيمة المضافة");
  await expect(arabic).toContainText("بنك المثال");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Make a payment link" }).click();
  await expect(page.getByText("Payment link made.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Payment link" }),
  ).toHaveAttribute("href", /\/pay\/\d+$/);

  // Part by bank transfer, recorded by finance.
  await page.goto("/billing");
  await page.getByRole("button", { name: "Record a payment" }).click();
  const payment = page.getByRole("form", { name: "Record a payment" });
  await choose(payment, "From", schoolName);
  await payment.getByLabel(/^Amount/).fill("20000");
  await payment.getByLabel("Reference").fill("Transfer 4411");
  await payment.getByLabel(new RegExp(`^${number}:`)).fill("20000");
  await payment.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();

  // The rest by card: Paymob's callback, refused unsigned, taken once signed.
  expect(
    (await payByCard(number, { cents: 1_990_000, forged: true })).status,
  ).toBe(401);
  expect((await payByCard(number, { cents: 1_990_000 })).status).toBe(200);
  expect((await payByCard(number, { cents: 1_990_000 })).status).toBe(200);
  await page.goto(invoiceUrl);
  await expect(
    recordHeader(page).getByText("Paid", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Payments/ }).click();
  const paid = page.getByRole("region", { name: "Payments", exact: true });
  await expect(paid.locator("tbody tr")).toHaveCount(2);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Credit it" }).click();
  const creditNote = page.getByRole("form", { name: "Credit it" });
  await creditNote
    .getByLabel("Description in English")
    .fill("Goodwill for a late start");
  await creditNote
    .getByLabel("Description in Arabic")
    .fill("تعويض عن تأخر البدء");
  await creditNote.getByLabel(/^Unit price/).fill("100");
  await creditNote.getByLabel("Why").fill("Agreed with the school");
  await creditNote.getByRole("button", { name: "Issue credit note" }).click();
  await expect(page.getByText(/^Credited as CN-\d{4}-\d{5}\./)).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  const history = page.getByRole("table", { name: "Changes" });
  await expect(history.getByText("Issued", { exact: true })).toBeVisible();
  await expect(history.getByText("Credited", { exact: true })).toBeVisible();

  // The school's administrator sees the invoice, settled, and its paper.
  const { page: school, context } = await schoolAdministrator(browser, slug);
  await school.goto(`${portal(slug)}/admin/billing`);
  const listed = school.getByRole("listitem", { name: `Invoice ${number}` });
  await expect(listed).toContainText("Paid");
  await expect(school.getByText("Example Bank, IBAN EG00 0000")).toBeVisible();
  await listed.getByRole("button", { name: "View" }).click();
  const sheet = school.getByRole("dialog", { name: `Invoice ${number}` });
  await expect(sheet.getByRole("article")).toContainText("39,900.00");
  await context.close();
});
