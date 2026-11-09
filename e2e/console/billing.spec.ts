import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { expect, test } from "@playwright/test";

import {
  addPlan,
  businessDetails,
  choose,
  createSchool,
  hydrated,
  openDraftOf,
  OWNER,
  payByCard,
  recordHeader,
  schoolAdministrator,
  signInAs,
  unique,
} from "../fixtures/console";
import { portal } from "../fixtures/sign-in";

test("an invoice by hand is drafted, changed and credited one line at a time", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  await businessDetails(page);
  await page.goto("/customers");
  await page.getByRole("button", { name: "New customer" }).click();
  const customer = page.getByRole("form", { name: "New customer" });
  const name = `Linden ${unique()}`;
  await customer.getByLabel("Legal name in English").fill(name);
  await customer.getByLabel("Why").fill("Bought a training day");
  await customer.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const customerId = new URL(page.url()).pathname.split("/").at(-1) ?? "";

  await page.goto(`/invoices/new?customerId=${customerId}`);
  const form = page.getByRole("form", { name: "New invoice" });
  await hydrated(form);
  await form.getByRole("button", { name: "Save the draft" }).click();
  await expect(form.getByRole("alert")).toContainText("Add a line.");
  await form.getByRole("button", { name: "Add line" }).click();
  const adding = page.getByRole("form", { name: "Add a line" });
  await adding.getByRole("button", { name: "Add line" }).click();
  await expect(adding.getByText("Describe it in English.")).toBeVisible();
  await adding.getByLabel("Description in English").fill("Training day");
  await adding.getByLabel("Description in Arabic").fill("يوم تدريب");
  await adding.getByLabel("Quantity").fill("2");
  await adding.getByLabel("Unit price (EGP)").fill("5000");
  await adding.getByLabel("Discount (%)").fill("10");
  // 2 at 5,000.00 less 10% is 9,000.00.
  await expect(adding).toContainText("EGP 9,000.00");
  await adding.getByRole("button", { name: "Add line" }).click();
  const lines = form.getByRole("table", { name: "Lines" });
  await expect(lines.getByRole("row", { name: /^Total/ })).toContainText(
    "EGP 10,260.00",
  );
  await form.getByRole("button", { name: "Save the draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  // On the draft each line is saved as soon as its sheet is.
  const draftLines = page.getByRole("table", { name: "Lines" });
  await draftLines
    .getByRole("button", { name: "Edit line 1: Training day" })
    .click();
  const changing = page.getByRole("form", { name: "Edit line 1" });
  await changing.getByLabel("Quantity").fill("3");
  await changing.getByRole("button", { name: "Save line" }).click();
  await expect(page.getByText("Line saved.")).toBeVisible();
  // 3 at 5,000.00 less 10% is 13,500.00, and 14% VAT makes 15,390.00.
  const paper = page.getByRole("article", { name: "Draft invoice" });
  await expect(paper).toContainText("13,500.00");
  await expect(paper).toContainText("15,390.00");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Add a line" }).click();
  const second = page.getByRole("form", { name: "Add a line" });
  await second.getByLabel("Description in English").fill("Printed guides");
  await second.getByLabel("Description in Arabic").fill("أدلة مطبوعة");
  await second.getByLabel("Unit price (EGP)").fill("250");
  await second.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByText("Line added.")).toBeVisible();
  await expect(paper).toContainText("Printed guides");
  await draftLines.getByRole("button", { name: "Actions for Line 2" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Line removed.")).toBeVisible();
  await expect(paper).not.toContainText("Printed guides");
  // A draft keeps one line, so its last cannot be removed.
  await draftLines.getByRole("button", { name: "Actions for Line 1" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Issue this invoice" }).click();
  await expect(page.getByText(/^Issued as INV-/)).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Credit it" }).click();
  const creditNote = page.getByRole("form", { name: "Credit it" });
  await creditNote.getByRole("button", { name: "Take back a line" }).click();
  await page.getByRole("menuitem", { name: /^Training day/ }).click();
  const taken = page.getByRole("form", { name: "Add a line" });
  await expect(taken.getByLabel("Description in English")).toHaveValue(
    "Training day",
  );
  await taken.getByLabel("Quantity").fill("1");
  await taken.getByRole("button", { name: "Add line" }).click();
  // One of the three, 4,500.00, and 14% VAT credits 5,130.00.
  await expect(
    creditNote.getByRole("table", { name: "Lines" }).getByRole("row", {
      name: /^Total/,
    }),
  ).toContainText("EGP 5,130.00");
  await creditNote.getByLabel("Why").fill("One day was cancelled");
  await creditNote.getByRole("button", { name: "Issue credit note" }).click();
  await expect(page.getByText(/^Credited as CN-\d{4}-\d{5}\./)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Credit notes" }).locator("tbody tr"),
  ).toHaveCount(1);
});

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
  // A credit note is a page of its own: each line is added in its own sheet.
  const creditNote = page.getByRole("form", { name: "Credit it" });
  await creditNote.getByRole("button", { name: "Add line" }).click();
  const goodwill = page.getByRole("form", { name: "Add a line" });
  await goodwill
    .getByLabel("Description in English")
    .fill("Goodwill for a late start");
  await goodwill
    .getByLabel("Description in Arabic")
    .fill("تعويض عن تأخر البدء");
  await goodwill.getByLabel(/^Unit price/).fill("100");
  await goodwill.getByRole("button", { name: "Add line" }).click();
  // 100.00 and 14% VAT credits 114.00.
  await expect(
    creditNote.getByRole("table", { name: "Lines" }).getByRole("row", {
      name: /^Total/,
    }),
  ).toContainText("EGP 114.00");
  await creditNote.getByLabel("Why").fill("Agreed with the school");
  await creditNote.getByRole("button", { name: "Issue credit note" }).click();
  await expect(page.getByText(/^Credited as CN-\d{4}-\d{5}\./)).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  const history = page.getByRole("table", { name: "Changes" });
  await expect(history.getByText("Issued", { exact: true })).toBeVisible();
  await expect(history.getByText("Credited", { exact: true })).toBeVisible();

  // The school's administrator sees the invoice, settled, and its paper.
  const { page: school, context } = await schoolAdministrator(browser, slug);
  await school.goto(`${portal(slug)}/billing`);
  const listed = school
    .getByRole("table", { name: "Invoices" })
    .getByRole("row")
    .filter({ hasText: `Invoice ${number}` });
  await expect(listed).toContainText("Paid");
  await expect(school.getByText("Example Bank, IBAN EG00 0000")).toBeVisible();
  await listed
    .getByRole("button", { name: `Invoice ${number}`, exact: true })
    .click();
  const sheet = school.getByRole("dialog", { name: `Invoice ${number}` });
  await expect(sheet.getByRole("article")).toContainText("39,900.00");
  await context.close();
});
