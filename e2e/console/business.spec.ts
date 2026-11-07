import type { Page } from "@playwright/test";

import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { expect, test } from "@playwright/test";

import {
  addPlan,
  choose,
  createSchool,
  FINANCE,
  hydrated,
  OWNER,
  recordHeader,
  signInAs,
  unique,
} from "../fixtures/console";
import { sentTo } from "../fixtures/mail";
import { PASSWORD, portal, signInWith } from "../fixtures/sign-in";

// Each test that runs the daily round waits for the one before: only one
// round runs at a time, and a second is refused while it does.
test.describe.configure({ mode: "serial" });

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
  await page.getByRole("button", { name: "Change the terms" }).click();
  const terms = page.getByRole("form", { name: "Change the terms" });
  await terms.getByRole("radio", { name: "A trial" }).check();
  await terms.getByLabel("Trial's last day").fill(lastDay);
  await terms.getByLabel("Why").fill(reason);
  await terms.getByRole("button", { name: "Save terms" }).click();
  await expect(page.getByText("Terms saved.")).toBeVisible();
}

/** Opens a school's subscription from the school's own page, where it now is. */
async function openSubscriptionFromSchool(page: Page) {
  await page
    .getByRole("region", { name: "Account" })
    .getByRole("link", { name: "Open subscription" })
    .click();
  await expect(page).toHaveURL(/\/subscriptions\/[0-9a-f-]{36}$/);
}

test("an owner sells a plan, versions it and retires the old version", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  const name = `Standard ${unique()}`;
  await addPlan(page, name);
  // Saving a new plan opens its own page.
  await expect(recordHeader(page)).toContainText(name);
  await page.getByRole("tab", { name: /^Versions/ }).click();
  const versions = page.getByRole("table", { name: "Versions" });
  await expect(versions.getByRole("row", { name: /^Version 1/ })).toContainText(
    "EGP 350.00 per student a year",
  );

  const more = page.getByRole("button", { name: "More actions" });
  await hydrated(more);
  await page.getByRole("button", { name: "New version" }).click();
  const next = page.getByRole("form", { name: `New version of ${name}` });
  await next.getByLabel("Students", { exact: true }).fill("500");
  await next.getByLabel("Why").fill("More students for the price");
  await next.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("New version saved.")).toBeVisible();
  await expect(versions.getByRole("row", { name: /^Version 2/ })).toContainText(
    "Students: 400 → 500",
  );

  await more.click();
  await page.getByRole("menuitem", { name: "Retire version 1" }).click();
  const retire = page.getByRole("form", { name: "Retire version 1" });
  await retire.getByLabel("Why").fill("Replaced by version 2");
  await retire.getByRole("button", { name: "Retire this version" }).click();
  await expect(
    page.getByText("Retired. Contracts that hold it keep it."),
  ).toBeVisible();
  await expect(versions.getByText(/^Retired /)).toHaveCount(1);

  await page.goto("/catalogue");
  const catalogueMenu = page.getByRole("button", { name: "More actions" });
  await hydrated(catalogueMenu);
  await catalogueMenu.click();
  await page.getByRole("menuitem", { name: "New add-on" }).click();
  const addOn = page.getByRole("form", { name: "New add-on" });
  const addOnName = `Video ${unique()}`;
  await addOn.getByLabel("Code").fill(`e2e_${unique()}`);
  await addOn.getByLabel("Name in English").fill(addOnName);
  await addOn.getByLabel("Name in Arabic").fill("الفيديو");
  await choose(addOn, "Module", "Video");
  await addOn.getByLabel("Why").fill("Sold on its own");
  await addOn.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Add-on saved.")).toBeVisible();
  await expect(recordHeader(page)).toContainText(addOnName);
  await expect(page.getByText("Gives Video.")).toBeVisible();
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

  await page.getByRole("button", { name: "Add contact" }).click();
  const contact = page.getByRole("form", { name: "New contact" });
  await contact.getByLabel("Name").fill("Salama Ashoush");
  await contact.getByLabel("Email").fill("salama@oakfield.example.com");
  await contact.getByRole("checkbox", { name: "Billing" }).check();
  await contact.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Contact added.")).toBeVisible();
  await page.getByRole("tab", { name: /^Contacts/ }).click();
  await expect(
    page
      .getByRole("table", { name: "Contacts" })
      .getByRole("row", { name: /Salama Ashoush/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "About" }).click();
  await page
    .getByRole("region", { name: "Agreements" })
    .getByRole("button", { name: "Record acceptance" })
    .click();
  const agreements = page.getByRole("form", { name: "Record an acceptance" });
  await choose(agreements, "Agreement", "Data processing agreement");
  await agreements.getByLabel("Version accepted").fill("2026-11");
  await agreements.getByRole("button", { name: "Record acceptance" }).click();
  await expect(page.getByText(/^Version 2026-11, accepted/)).toBeVisible();

  await page.getByRole("button", { name: "Edit legal details" }).click();
  const details = page.getByRole("form", { name: "Edit legal details" });
  await details.getByLabel("Tax registration number").fill("123-456-789");
  await details.getByLabel("Why").fill("Their tax card arrived");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  const changes = page.getByRole("table", { name: "Changes" });
  await expect(
    changes.getByText("Details changed", { exact: true }),
  ).toBeVisible();
  await expect(
    changes.getByText("Customer created", { exact: true }),
  ).toBeVisible();
  await expect(
    changes.getByText("Tax registration number: none → 123-456-789"),
  ).toBeVisible();
});

test("a trial sold with its school becomes a contract with a plan, which the school has at once", async ({
  page,
}) => {
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
  // The school's own page shows what it has and sends an operator to its subscription.
  await page.getByRole("tab", { name: "Limits" }).click();
  await expect(
    page.getByRole("list", { name: "Use against its limits" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await page.getByRole("tab", { name: "About" }).click();
  await openSubscriptionFromSchool(page);
  await expect(
    recordHeader(page).getByText("Trial", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Schools/ }).click();
  const card = page
    .getByRole("region", { name: "Schools" })
    .getByRole("row", { name: new RegExp(schoolName) });
  await expect(card).toContainText("Nothing changes");

  await page.getByRole("tab", { name: /^Items/ }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  const item = page.getByRole("form", { name: "Add an item" });
  await choose(item, "What", `Plan: ${planName} version 1`);
  await expect(item.getByLabel("Unit price (EGP)")).toHaveValue("350.00");
  await item.getByLabel("Why").fill("Signed the order form");
  await item.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByText("Added. Publish for the schools to have it now."),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Schools/ }).click();
  await expect(card).toContainText("Gains Coding and blocks");

  await recordHeader(page).getByRole("button", { name: "Publish now" }).click();
  const publish = page.getByRole("form", { name: "Publish now" });
  await publish
    .getByLabel("Why now")
    .fill("The school starts coding on Monday");
  await publish.getByRole("button", { name: "Publish now" }).click();
  await expect(
    page.getByText("Published to 1 school. They have it now."),
  ).toBeVisible();
  await expect(card).toContainText("Nothing changes");
  await page.getByRole("tab", { name: "Publications" }).click();
  await expect(
    page.getByText("The school starts coding on Monday"),
  ).toBeVisible();

  // A pilot of badges, given today and ended from tomorrow.
  await page.getByRole("tab", { name: /^Overrides/ }).click();
  await page.getByRole("button", { name: "Add override" }).click();
  const override = page.getByRole("form", { name: "Add an override" });
  await choose(override, "Module", "Badges");
  await override.getByLabel("Why").fill("A pilot of badges");
  await override.getByRole("button", { name: "Add override" }).click();
  await page.getByRole("tab", { name: /^Schools/ }).click();
  await expect(card).toContainText("Gains Badges");
  await page.getByRole("tab", { name: /^Overrides/ }).click();
  await page
    .getByRole("region", { name: "Overrides" })
    .getByRole("checkbox", { name: "Select all rows on this page" })
    .click();
  await page.getByRole("button", { name: "End", exact: true }).click();
  const end = page.getByRole("form", { name: "End 1 override" });
  await end
    .getByLabel("First day without it")
    .fill(addDays(businessToday(), 1));
  await end.getByLabel("Why").fill("The pilot is a day long");
  await end.getByRole("button", { name: "End 1 override" }).click();
  await expect(page.getByText(/^Ends /)).toBeVisible();

  await page.getByRole("tab", { name: "Terms" }).click();
  await page.getByRole("button", { name: "Change the terms" }).click();
  const terms = page.getByRole("form", { name: "Change the terms" });
  await terms.getByRole("radio", { name: "A contract" }).check();
  await terms.getByLabel("Term starts").fill(businessToday());
  await terms.getByLabel("Term ends").fill(addDays(businessToday(), 365));
  await terms.getByLabel("Contracted students").fill("300");
  await terms.getByLabel("Why").fill("Signed for the school year");
  await terms.getByRole("button", { name: "Save terms" }).click();
  await expect(page.getByText("Terms saved.")).toBeVisible();
  await expect(
    recordHeader(page).getByText("Active", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: /^Schools/ }).click();
  await card.getByRole("link", { name: schoolName }).click();
  await page.getByRole("tab", { name: /^Modules/ }).click();
  await expect(
    page
      .getByRole("region", { name: "Modules" })
      .getByRole("row", { name: /Coding and blocks/ }),
  ).toContainText("Included");
});

test("a group set up as a draft is left, resumed, and finished after a refusal", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  const slug = `e2e-${unique()}`;
  const taken = `www.${slug}.example.com`;
  // Another school already holds the host the draft will ask for.
  await createSchool(page, {
    slug: `${slug}-first`,
    nameEn: `First ${slug}`,
    nameAr: "الأولى",
  });
  await page.getByRole("tab", { name: /^Addresses/ }).click();
  await page.getByRole("button", { name: "Add host" }).click();
  const host = page.getByRole("form", { name: "Add a host" });
  await host.getByLabel("Hostname").fill(taken);
  await host.getByLabel("Why").fill("Its own website");
  await host.getByRole("button", { name: "Add host" }).click();
  await expect(page.getByText("Added as pending.")).toBeVisible();

  await page.goto("/schools/new");
  await page.getByRole("button", { name: "Start a new school" }).click();
  await page.getByRole("button", { name: "New customer" }).click();
  const customer = page.getByRole("form", { name: "New customer" });
  const customerName = `Harbour Schools ${slug}`;
  await customer.getByLabel("Legal name in English").fill(customerName);
  await customer.getByLabel("Why").fill("Two schools signed together");
  await customer.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByLabel("Sold to")).not.toContainText("Choose");
  await page.getByRole("button", { name: "Save and continue" }).click();

  const schools = page.getByRole("form", { name: "Schools" });
  await choose(schools, "Kind", "A school group with one or more schools");
  await schools.getByLabel("Group name in English").fill(customerName);
  await schools
    .getByLabel("Name in English", { exact: true })
    .fill("Harbour East");
  await schools.getByLabel("Address", { exact: true }).fill(`${slug}-east`);
  await schools.getByRole("button", { name: "Add a school" }).click();
  await schools.locator("#school-1-name-en").fill("Harbour West");
  await schools.locator("#school-1-slug").fill(`${slug}-west`);
  await schools.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("form", { name: "Plan" })).toBeVisible();

  // Left at the plan, and found again among the drafts.
  await page.goto("/schools/new");
  await page
    .getByRole("row")
    .filter({ hasText: customerName })
    .getByRole("link", { name: "Harbour East, Harbour West" })
    .click();
  await expect(page.getByRole("form", { name: "Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();

  const addresses = page.getByRole("form", { name: "Addresses" });
  await addresses.getByRole("button", { name: "Add a host" }).click();
  await addresses.getByLabel("Hostname").fill(taken);
  await addresses.getByRole("button", { name: "Save and continue" }).click();

  const people = page.getByRole("form", { name: "People" });
  await people.locator("#admin-0-givenNameEn").fill("Salama");
  await people.locator("#admin-0-email").fill(`salama@${slug}.example.com`);
  await people.locator("#admin-1-givenNameEn").fill("Mona");
  await people.locator("#admin-1-email").fill(`mona@${slug}.example.com`);
  await people
    .getByRole("checkbox", { name: "Someone runs every school of the group" })
    .check();
  await people.locator("#group-admin-givenNameEn").fill("Omar");
  await people.locator("#group-admin-email").fill(`omar@${slug}.example.com`);
  await people.getByRole("button", { name: "Save and continue" }).click();

  // No school is created before the customer accepts the data processing agreement.
  const create = page.getByRole("button", { name: "Create the school" });
  await expect(create).toBeDisabled();
  await page.getByRole("button", { name: "Record acceptance" }).click();
  const agreements = page.getByRole("form", { name: "Record an acceptance" });
  await choose(agreements, "Agreement", "Data processing agreement");
  await agreements.getByLabel("Version accepted").fill("2026-11");
  await agreements.getByRole("button", { name: "Record acceptance" }).click();
  await create.click();
  await expect(page.getByRole("alert")).toContainText(
    `Another school holds ${taken}.`,
    { timeout: 60_000 },
  );

  // The host is changed and creating resumes where it stopped.
  await page.getByRole("link", { name: "4. Addresses" }).click();
  await addresses.getByLabel("Hostname").fill(`www.${slug}-east.example.com`);
  await addresses.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("link", { name: "6. Review" }).click();
  await page
    .getByRole("button", { name: "Finish creating the school" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Harbour East, Harbour West created" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/as the group's administrator/)).toBeVisible();
  await expect(
    page.getByText(`mona@${slug}.example.com was emailed`),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open the school" }).click();
  await page.getByRole("tab", { name: /^Addresses/ }).click();
  await expect(
    page.getByRole("region", { name: "Web addresses" }).getByRole("row", {
      name: new RegExp(`www\\.${slug}-east\\.example\\.com`),
    }),
  ).toContainText("Pending");
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
  await openSubscriptionFromSchool(page);
  await setTrial(page, addDays(businessToday(), 3), "A month's trial");
  const publish = page.getByRole("form", { name: "Publish now" });
  await recordHeader(page).getByRole("button", { name: "Publish now" }).click();
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
  await recordHeader(page).getByRole("button", { name: "Publish now" }).click();
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
    recordHeader(page).getByText("Paused (read only)", { exact: true }),
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
  await page
    .getByRole("row", { name: new RegExp(FINANCE.name) })
    .getByRole("button", { name: "Change" })
    .click();
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
  await expect(finance.getByRole("tab", { name: /^Items/ })).toBeVisible();
  await expect(
    finance.getByRole("button", { name: "Change the terms" }),
  ).toHaveCount(0);
  await expect(finance.getByRole("button", { name: "Add item" })).toHaveCount(
    0,
  );
  await financeContext.close();
});
