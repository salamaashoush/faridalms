import type { PaymobTransaction } from "@faridalms/domain/paymob";
import type { Browser, Locator, Page } from "@playwright/test";

import { paymobHmac } from "@faridalms/domain/paymob";
import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

import type { StandInPerson } from "../../scripts/e2e-oidc";

import { OIDC_PERSON_COOKIE } from "../../scripts/e2e-oidc";
import { sentTo } from "./mail";
import { PASSWORD, portal, signInWith } from "./sign-in";

const oidcOrigin = `http://127.0.0.1:${process.env.E2E_OIDC_PORT ?? "3208"}`;

export const OWNER: StandInPerson = {
  sub: "e2e-owner",
  email: "salama@example.com",
  name: "Salama Ashoush",
};

export const SALES: StandInPerson = {
  sub: "e2e-sales",
  email: "sales@example.com",
  name: "Sam Sales",
};

export const FINANCE: StandInPerson = {
  sub: "e2e-finance",
  email: "finance@example.com",
  name: "Fatma Finance",
};

/**
 * Waits until React has hydrated a form the server rendered. What is typed
 * into it before then is replaced by React's own state, and a submit runs
 * no handler, so a spec that fills a form straight after loading the page
 * waits for this first.
 */
export async function hydrated(form: Locator) {
  await expect
    .poll(() =>
      form.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

/**
 * Opens a customer's draft from Billing's one list of invoices, found by
 * its search so other specs' invoices cannot page it out of view.
 */
export async function openDraftOf(page: Page, customer: string) {
  await page.goto("/billing");
  const search = page.getByRole("searchbox", { name: "Search invoices" });
  await hydrated(search);
  await search.fill(customer);
  await page
    .getByRole("region", { name: "Invoices" })
    .getByRole("row", { name: new RegExp(`${customer}.*Draft`) })
    .getByRole("link")
    .click();
}

/** Signs in to the console as a person the identity provider stand-in knows. */
export async function signInAs(page: Page, person: StandInPerson = OWNER) {
  await page.context().addCookies([
    {
      name: OIDC_PERSON_COOKIE,
      value: Buffer.from(JSON.stringify(person)).toString("base64url"),
      url: oidcOrigin,
    },
  ]);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * Creates a school of its own through New school, in the run's cell, so a
 * spec that changes what a school may use never touches the seeded ones.
 * It walks the draft: a new customer, the school, Basic on a trial, its
 * first administrator, the data processing agreement, then creates it.
 * Answers the school's id.
 */
export async function createSchool(
  page: Page,
  school: { slug: string; nameEn: string; nameAr: string },
  /** Sold under a contract for a plan from today, instead of Basic on a trial. */
  contract?: { plan: string; students: number; today: string; ends: string },
): Promise<string> {
  await page.goto("/schools/new");
  await page.getByRole("button", { name: "Start a new school" }).click();
  await expect(page.getByRole("form", { name: "Customer" })).toBeVisible();

  await page.getByRole("button", { name: "New customer" }).click();
  const customer = page.getByRole("form", { name: "New customer" });
  await customer.getByLabel("Legal name in English").fill(school.nameEn);
  await customer.getByLabel("Why").fill("Signed up at the fair");
  await customer.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByLabel("Sold to")).not.toContainText("Choose");
  await page.getByRole("button", { name: "Save and continue" }).click();

  const schools = page.getByRole("form", { name: "Schools" });
  await schools
    .getByLabel("Name in English", { exact: true })
    .fill(school.nameEn);
  await schools
    .getByLabel("Name in Arabic", { exact: true })
    .fill(school.nameAr);
  await schools.getByLabel("Address", { exact: true }).fill(school.slug);
  await schools.getByRole("button", { name: "Save and continue" }).click();

  const plan = page.getByRole("form", { name: "Plan" });
  await expect(plan).toBeVisible();
  if (contract) {
    await choose(plan, "Plan", `${contract.plan} version 1`);
    await plan.getByLabel("Quantity").fill(String(contract.students));
    await plan.getByRole("radio", { name: "A contract" }).check();
    await plan.getByLabel("Term starts").fill(contract.today);
    await plan.getByLabel("Term ends").fill(contract.ends);
    await plan
      .getByLabel("Contracted students")
      .fill(String(contract.students));
  }
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("form", { name: "Addresses" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();

  const people = page.getByRole("form", { name: "People" });
  await people.getByLabel("Given name in English").fill("Salama");
  await people.getByLabel("Family name in English").fill("Ashoush");
  await people.getByLabel("Given name in Arabic").fill("سلامة");
  await people.getByLabel("Family name in Arabic").fill("عشوش");
  await people
    .getByLabel("Email", { exact: true })
    .fill(`salama@${school.slug}.example.com`);
  await people.getByRole("button", { name: "Save and continue" }).click();

  await page.getByRole("button", { name: "Record acceptance" }).click();
  const agreements = page.getByRole("form", { name: "Record an acceptance" });
  await choose(agreements, "Agreement", "Data processing agreement");
  await agreements.getByLabel("Version accepted").fill("2026-11");
  await agreements.getByRole("button", { name: "Record acceptance" }).click();
  await page.getByRole("button", { name: "Create the school" }).click();
  await expect(
    page.getByRole("heading", { name: `${school.nameEn} created` }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Open the school" }).click();
  await expect(page).toHaveURL(/\/schools\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

/**
 * Picks an option of a design-system select: opens it by its label, then
 * chooses the option by its name from the list it pops up.
 */
export async function choose(
  scope: Page | Locator,
  label: string,
  option: string,
) {
  const page = "page" in scope ? scope.page() : scope;
  // A select is named by its label, then the choice it holds.
  const named = new RegExp(
    `^${label.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`,
  );
  await scope.getByRole("combobox", { name: named }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/**
 * A record page's header: its name, and the status and facts beside it,
 * which sit next to the heading rather than inside it.
 */
export function recordHeader(page: Page): Locator {
  return page
    .locator("header")
    .filter({ has: page.getByRole("heading", { level: 1 }) });
}

/** A short random suffix, so what a spec makes is its own. */
export const unique = () => Math.random().toString(36).slice(2, 8);

/** A plan with Basic and coding, priced per student, as the catalogue sells it. */
export async function addPlan(page: Page, name: string) {
  await page.goto("/catalogue");
  await page.getByRole("button", { name: "New plan" }).click();
  const form = page.getByRole("form", { name: "New plan" });
  await form.getByLabel("Code").fill(`e2e_${unique()}`);
  await form.getByLabel("Name in English").fill(name);
  await form.getByLabel("Name in Arabic").fill("الخطة التجريبية");
  await form.getByRole("checkbox", { name: "Coding and blocks" }).check();
  await form.getByLabel("Students", { exact: true }).fill("400");
  await form.getByRole("button", { name: "Add a price" }).click();
  await form.getByLabel("Amount").fill("350");
  await form.getByLabel("Why").fill("The launch catalogue");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Plan saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/catalogue\/plans\/[0-9a-f-]{36}$/);
}

/**
 * The business's legal details, bank and Egypt's VAT, set once for every
 * console spec that prints a document; another spec may have set them.
 */
export async function businessDetails(page: Page) {
  await page.goto("/settings");
  const details = page.getByRole("form", { name: "Legal details" });
  await hydrated(details);
  const name = details.getByLabel("Legal name in English");
  if (!(await name.inputValue())) {
    await name.fill("Acme Learning");
    await details.getByLabel("Legal name in Arabic").fill("أكمي للتعليم");
    await details
      .getByLabel("Address in English")
      .fill("1 Example Street, Cairo");
    await details
      .getByLabel("Address in Arabic")
      .fill("١ شارع المثال، القاهرة");
    await details.getByLabel("Tax registration number").fill("100-200-300");
    await details.getByLabel("Email").fill("billing@example.com");
    await details
      .getByLabel("Bank details in English")
      .fill("Example Bank, IBAN EG00 0000");
    await details
      .getByLabel("Bank details in Arabic")
      .fill("بنك المثال، رقم الحساب EG00 0000");
    await details.getByLabel("Why").fill("The company's registration");
    await details.getByRole("button", { name: "Save legal details" }).click();
    await expect(
      page.getByText(/^(Legal details saved\.|Someone changed the details)/),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Add rate" }).click();
  const rate = page.getByRole("form", { name: "Add a rate" });
  await choose(rate, "Country", "Egypt");
  await rate.getByLabel("Percentage").fill("14");
  await rate.getByLabel("From").fill("2016-07-01");
  await rate.getByLabel("Why").fill("Egypt's VAT law");
  await rate.getByRole("button", { name: "Add rate" }).click();
  await expect(
    page.getByText(/^(Rate added\.|Egypt already has a rate from that day\.)/),
  ).toBeVisible();
}

const paymobOrigin = `http://127.0.0.1:${process.env.E2E_PAYMOB_PORT ?? "3209"}`;
const consoleOrigin = `http://127.0.0.1:${process.env.E2E_OPS_PORT ?? "3206"}`;

/**
 * Pays the payment link made for an invoice, as a card holder on Paymob's
 * page would: the stand-in's link for the reference, then the processed
 * callback Paymob sends the console, signed with the account's secret.
 */
export async function payByCard(
  reference: string,
  options: { cents?: number; forged?: boolean } = {},
) {
  const links = (await (await fetch(`${paymobOrigin}/e2e/links`)).json()) as {
    id: number;
    order: number;
    amountCents: number;
    reference: string;
  }[];
  const link = links.findLast((row) => row.reference === reference);
  if (!link) throw new Error(`no payment link for ${reference}`);
  const obj: PaymobTransaction = {
    id: 700_000 + link.id,
    amount_cents: options.cents ?? link.amountCents,
    created_at: new Date().toISOString().slice(0, 23),
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 4_097_558,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: link.order },
    owner: 302_852,
    pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
    success: true,
  };
  const hmac = paymobHmac(
    obj,
    options.forged ? "not the secret" : (process.env.PAYMOB_HMAC_SECRET ?? ""),
  );
  return fetch(`${consoleOrigin}/payments/paymob?hmac=${hmac}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "TRANSACTION", obj }),
  });
}

/**
 * The school's first administrator, as createSchool names them: chooses a
 * password from the welcome email and signs in to the school's portal, in
 * a browser context of their own.
 */
export async function schoolAdministrator(browser: Browser, slug: string) {
  const email = `salama@${slug}.example.com`;
  const invite = await sentTo(email, "/welcome#");
  const secret = /\/welcome#(\S+)/.exec(invite?.text ?? "")?.[1];
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${portal(slug)}/welcome#${secret}`);
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByLabel("Type it again").fill(PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Password saved" }),
  ).toBeVisible();
  await signInWith(page, email, PASSWORD, "/admin", slug);
  return { page, context };
}

const BACKDATE = `
const { SQL } = await import("bun");
const sql = new SQL(process.env.BUSINESS_DATABASE_URL);
const rows = await sql\`update invoices set due_on = \${process.env.DUE_ON}, issued_on = \${process.env.ISSUED_ON}
  where number = \${process.env.INVOICE_NUMBER} returning id\`;
await sql.close();
if (rows.length !== 1) throw new Error("no such invoice");
`;

/**
 * Moves an issued invoice's dates back as if the days had passed: due that
 * many days ago, issued its thirty days before. A browser test cannot wait
 * out a payment term, and Playwright runs on Node, so Bun's SQL client does
 * it in a child process as the console's own database user.
 */
export function asIfOverdue(number: string, days: number) {
  const dueOn = addDays(businessToday(), -days);
  execFileSync("bun", ["--eval", BACKDATE], {
    env: {
      ...process.env,
      INVOICE_NUMBER: number,
      DUE_ON: dueOn,
      ISSUED_ON: addDays(dueOn, -30),
    },
    stdio: "inherit",
  });
}
