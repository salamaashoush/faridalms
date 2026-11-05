import type { Page } from "@playwright/test";

import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { expect, test } from "@playwright/test";

import { createSchool, FINANCE, OWNER, signInAs } from "../fixtures/console";
import { sentTo } from "../fixtures/mail";
import { PASSWORD, portal, signInWith } from "../fixtures/sign-in";

// Each test that runs the daily round waits for the one before: only one
// round runs at a time, and a second is refused while it does.
test.describe.configure({ mode: "serial" });

const unique = () => Math.random().toString(36).slice(2, 8);

/** A plan with Basic and coding, priced per student, as the catalogue sells it. */
async function addPlan(page: Page, name: string) {
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
}

/** Runs today's round from the Subscriptions page. */
async function runRound(page: Page) {
  await page.goto("/subscriptions");
  await page.getByRole("button", { name: "Run the round now" }).click();
  await expect(page.getByText("The round ran.")).toBeVisible({
    timeout: 60_000,
  });
}

/** Makes the open subscription a trial whose last day is the one given. */
async function setTrial(page: Page, lastDay: string, reason: string) {
  const terms = page.getByRole("form", { name: "Terms" });
  await terms.getByLabel("A trial").check();
  await terms.getByLabel("Trial's last day").fill(lastDay);
  await terms.getByLabel("Why").fill(reason);
  await terms.getByRole("button", { name: "Save terms" }).click();
  await expect(page.getByText("Terms saved.")).toBeVisible();
}

/** Opens the subscription the daily round gave a school's tenant. */
async function openSubscriptionOf(page: Page, schoolName: string) {
  await runRound(page);
  await page
    .getByRole("row", { name: new RegExp(schoolName) })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { name: schoolName })).toBeVisible();
}

test("an owner sells a plan, versions it and retires the old version", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  const name = `Standard ${unique()}`;
  await addPlan(page, name);
  const plan = page.getByRole("article", { name });
  await expect(plan.getByText("Version 1")).toBeVisible();
  await expect(plan.getByText("EGP 350.00 per student a year")).toBeVisible();

  await plan.getByRole("button", { name: "New version" }).click();
  const next = plan.getByRole("form", { name: `New version of ${name}` });
  await next.getByLabel("Students", { exact: true }).fill("500");
  await next.getByLabel("Why").fill("More students for the price");
  await next.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("New version saved.")).toBeVisible();
  await expect(plan.getByText("Version 2")).toBeVisible();

  await plan.getByRole("button", { name: "Retire" }).last().click();
  const retire = plan.getByRole("form", { name: "Retire version 1" });
  await retire.getByLabel("Why").fill("Replaced by version 2");
  await retire.getByRole("button", { name: "Retire this version" }).click();
  await expect(
    page.getByText("Retired. Contracts that hold it keep it."),
  ).toBeVisible();
  await expect(plan.getByText(/^Retired /)).toHaveCount(1);

  await page.getByRole("button", { name: "New add-on" }).click();
  const addOn = page.getByRole("form", { name: "New add-on" });
  const addOnName = `Video ${unique()}`;
  await addOn.getByLabel("Code").fill(`e2e_${unique()}`);
  await addOn.getByLabel("Name in English").fill(addOnName);
  await addOn.getByLabel("Name in Arabic").fill("الفيديو");
  await addOn.getByLabel("Module").selectOption({ label: "Video" });
  await addOn.getByLabel("Why").fill("Sold on its own");
  await addOn.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Add-on saved.")).toBeVisible();
  await expect(
    page.getByRole("article", { name: addOnName }).getByText("Gives Video."),
  ).toBeVisible();
});

test("a customer keeps its contacts, agreements and history", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Customers" }).click();
  await page.getByRole("button", { name: "New customer" }).click();
  const name = `Oakfield Schools ${unique()}`;
  const form = page.getByRole("form", { name: "New customer" });
  await form.getByLabel("Legal name in English").fill(name);
  await form.getByLabel("Why").fill("Met at the October fair");
  await form.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const contact = page.getByRole("form", { name: "New contact" });
  await contact.getByLabel("Name").fill("Salama Ashoush");
  await contact.getByLabel("Email").fill("salama@oakfield.example.com");
  await contact.getByRole("checkbox", { name: "Billing" }).check();
  await contact.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Contact added.")).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Salama Ashoush" }),
  ).toBeVisible();

  const agreements = page.getByRole("form", { name: "Record an acceptance" });
  await agreements
    .getByLabel("Agreement")
    .selectOption({ label: "Data processing agreement" });
  await agreements.getByLabel("Version accepted").fill("2026-11");
  await agreements.getByRole("button", { name: "Record acceptance" }).click();
  await expect(page.getByText(/^version 2026-11, accepted/)).toBeVisible();

  const details = page.getByRole("form", { name: "Customer details" });
  await details.getByLabel("Tax registration number").fill("123-456-789");
  await details.getByLabel("Why").fill("Their tax card arrived");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(
    page.getByText("Details changed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Customer created", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("taxNumber: none → 123-456-789")).toBeVisible();
});

test("a school's subscription sets what it may use", async ({ page }) => {
  await signInAs(page, OWNER);
  const planName = `Coding plan ${unique()}`;
  await addPlan(page, planName);
  const slug = `e2e-${unique()}`;
  const schoolName = `Birch ${slug}`;
  await createSchool(page, {
    slug,
    nameEn: schoolName,
    nameAr: "مدرسة البتولا",
  });
  // The school's own page sends an operator to its subscription.
  await expect(
    page.getByRole("button", { name: "Save entitlements" }),
  ).toHaveCount(0);

  await openSubscriptionOf(page, schoolName);
  await expect(page.getByText("Grandfathered").first()).toBeVisible();
  const card = page.getByRole("listitem", { name: schoolName });
  await expect(card.getByText("Published as it stands.")).toBeVisible();

  const item = page.getByRole("form", { name: "Add an item" });
  await item
    .getByLabel("What")
    .selectOption({ label: `${planName} version 1` });
  await expect(item.getByLabel("Unit price (EGP)")).toHaveValue("350.00");
  await item.getByLabel("Why").fill("Signed the order form");
  await item.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByText("Added. Publish for the schools to have it now."),
  ).toBeVisible();
  await expect(card.getByText("Gains Coding and blocks")).toBeVisible();

  const publish = page.getByRole("form", { name: "Publish" });
  await publish
    .getByLabel("Why now")
    .fill("The school starts coding on Monday");
  await publish.getByRole("button", { name: "Publish now" }).click();
  await expect(
    page.getByText("Published to 1 school. They have it now."),
  ).toBeVisible();
  await expect(card.getByText("Published as it stands.")).toBeVisible();
  await expect(
    page.getByText("The school starts coding on Monday"),
  ).toBeVisible();

  // Its overrides kept the school as it was; they end from tomorrow.
  const tomorrow = addDays(businessToday(), 1);
  await page.getByRole("button", { name: /^Choose all/ }).click();
  const end = page.getByRole("form", { name: /^End \d+ chosen$/ });
  await end.getByLabel("First day without it").fill(tomorrow);
  await end.getByLabel("Why").fill("The plan replaces them");
  await end.getByRole("button", { name: /^End \d+ chosen$/ }).click();
  await expect(page.getByText(/^Ends /)).toBeVisible();

  const terms = page.getByRole("form", { name: "Terms" });
  await terms.getByLabel("A contract").check();
  await terms.getByLabel("Term starts").fill(businessToday());
  await terms.getByLabel("Term ends").fill(addDays(businessToday(), 365));
  await terms.getByLabel("Contracted students").fill("300");
  await terms.getByLabel("Why").fill("Renewed under a contract");
  await terms.getByRole("button", { name: "Save terms" }).click();
  await expect(page.getByText("Terms saved.")).toBeVisible();
  await expect(page.getByText("Grandfathered")).toHaveCount(0);

  await card.getByRole("link", { name: schoolName }).click();
  const entitlements = page.getByRole("region", { name: "Entitlements" });
  await expect(entitlements.getByText("Coding and blocks")).toBeVisible();
  await entitlements.getByRole("link", { name: "subscription" }).click();
  await expect(page).toHaveURL(/\/subscriptions\/[0-9a-f-]{36}$/);
});

test("a school's administrators see its trial's days left, then that it is paused", async ({
  browser,
  page,
}) => {
  await signInAs(page, OWNER);
  const slug = `e2e-${unique()}`;
  const schoolName = `Cedar ${slug}`;
  const administrator = `salama@${slug}.example.com`;
  const schoolId = await createSchool(page, {
    slug,
    nameEn: schoolName,
    nameAr: "مدرسة الأرز",
  });
  await openSubscriptionOf(page, schoolName);
  await setTrial(page, addDays(businessToday(), 3), "A month's trial");
  const publish = page.getByRole("form", { name: "Publish" });
  await publish.getByLabel("Why now").fill("The trial starts today");
  await publish.getByRole("button", { name: "Publish now" }).click();
  await expect(
    page.getByText("Published to 1 school. They have it now."),
  ).toBeVisible();
  const subscription = page.url();

  // The school's first administrator takes the emailed link and signs in.
  const invite = await sentTo(administrator, "/welcome#");
  // The link names the school's production origin; the run serves it here.
  const secret = /\/welcome#(\S+)/.exec(invite?.text ?? "")?.[1];
  expect(secret).toBeTruthy();
  const portalContext = await browser.newContext();
  const school = await portalContext.newPage();
  await school.goto(`${portal(slug)}/welcome#${secret}`);
  await school.getByLabel("New password").fill(PASSWORD);
  await school.getByLabel("Type it again").fill(PASSWORD);
  await school.getByRole("button", { name: "Save password" }).click();
  await expect(
    school.getByRole("status").filter({ hasText: "Password saved" }),
  ).toBeVisible();
  await signInWith(school, administrator, PASSWORD, "/admin", slug);
  const notice = school.getByRole("complementary", {
    name: "About your school's plan",
  });
  await expect(notice).toContainText(
    /Your school's trial ends on .+, in 3 days\./,
  );

  // A change reaches the school as soon as it is published, not a minute on.
  await page.goto(subscription);
  await setTrial(page, addDays(businessToday(), 5), "Two more days to decide");
  await publish.getByLabel("Why now").fill("The trial is extended");
  await publish.getByRole("button", { name: "Publish now" }).click();
  await expect(
    page.getByText("Published to 1 school. They have it now."),
  ).toBeVisible();
  await school.reload();
  await expect(notice).toContainText(
    /Your school's trial ends on .+, in 5 days\./,
  );

  // The trial is over without a contract: the round makes it read only.
  await page.goto(subscription);
  await setTrial(
    page,
    addDays(businessToday(), -1),
    "The trial began last month",
  );
  await runRound(page);
  await expect(page.getByText(/[1-9]\d* trials paused/)).toBeVisible();
  await page.goto(`/schools/${schoolId}`);
  await expect(
    page
      .getByRole("heading", { name: schoolName })
      .getByText("Paused (read only)"),
  ).toBeVisible();
  await school.reload();
  await expect(notice).toContainText(
    "Your school's account is paused. Everything can still be read, but nothing can be changed for now",
  );
  await portalContext.close();
});

test("finance reads customers and subscriptions but not the catalogue", async ({
  browser,
  page,
}) => {
  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Operators" }).click();
  const financeContext = await browser.newContext();
  const finance = await financeContext.newPage();
  await signInAs(finance, FINANCE);
  await page.reload();
  const card = page.getByRole("form", { name: FINANCE.name });
  await card.getByRole("checkbox", { name: /^Finance/ }).check();
  await card.getByLabel("Why").fill("Joined to handle invoices");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Operator saved.")).toBeVisible();

  await finance.goto("/");
  const nav = finance.getByRole("navigation", { name: "Console" });
  await expect(nav.getByRole("link", { name: "Customers" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Subscriptions" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Catalogue" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Subscriptions" }).click();
  await expect(
    finance.getByRole("heading", { name: "Subscriptions" }),
  ).toBeVisible();
  await expect(
    finance.getByRole("button", { name: "Run the round now" }),
  ).toHaveCount(0);
  await finance.getByRole("row").nth(1).getByRole("link").click();
  await expect(finance.getByRole("form", { name: "Terms" })).toHaveCount(0);
  await expect(finance.getByRole("form", { name: "Add an item" })).toHaveCount(
    0,
  );
  await expect(finance.getByRole("heading", { name: "Items" })).toBeVisible();
  await financeContext.close();
});
