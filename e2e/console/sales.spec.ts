import { businessToday } from "@faridalms/domain/subscriptions";
import { expect, test } from "@playwright/test";

import {
  addPlan,
  businessDetails,
  choose,
  hydrated,
  OWNER,
  recordHeader,
  signInAs,
  unique,
} from "../fixtures/console";
import { sentTo } from "../fixtures/mail";
import { BARE, PASSWORD, portal, signInWith } from "../fixtures/sign-in";

// The business's details and VAT come first: the quotes below print them.
test.describe.configure({ mode: "serial" });

test("an owner sets the business's legal details and its VAT", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Settings" }).click();
  const details = page.getByRole("form", { name: "Legal details" });
  await details.getByLabel("Legal name in English").fill("Acme Learning");
  await details.getByLabel("Legal name in Arabic").fill("أكمي للتعليم");
  await details
    .getByLabel("Address in English")
    .fill("1 Example Street, Cairo");
  await details.getByLabel("Address in Arabic").fill("١ شارع المثال، القاهرة");
  await details.getByLabel("Tax registration number").fill("100-200-300");
  await details.getByLabel("Email").fill("billing@example.com");
  await details.getByLabel("Why").fill("The company's registration");
  await details.getByRole("button", { name: "Save legal details" }).click();
  await expect(page.getByText("Legal details saved.")).toBeVisible();

  await page.getByRole("button", { name: "Add rate" }).click();
  const rate = page.getByRole("form", { name: "Add a rate" });
  await choose(rate, "Country", "Egypt");
  await rate.getByLabel("Percentage").fill("14");
  await rate.getByLabel("From").fill("2017-07-01");
  await rate.getByLabel("Why").fill("Egypt's VAT law");
  await rate.getByRole("button", { name: "Add rate" }).click();
  await expect(page.getByText("Rate added.")).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "VAT rates" })
      .getByRole("row")
      .filter({ hasText: "Jul 1, 2017" }),
  ).toContainText("14%");
});

test("a demonstration request becomes a lead, a quote in both languages, and a customer whose school is ready to set up", async ({
  browser,
  page,
}) => {
  const school = `Nile Valley ${unique()}`;
  const visitor = await browser.newContext();
  const product = await visitor.newPage();
  await product.goto(BARE);
  await product.getByLabel("Your name").fill("Salama Ashoush");
  await product.getByLabel("Work email").fill("salama@nile.example.com");
  await product.getByLabel("School", { exact: true }).fill(school);
  await product
    .getByLabel("Your role")
    .selectOption({ label: "School leader" });
  // Faster than a person types, the request is answered and dropped.
  await product.waitForTimeout(3500);
  await product.getByRole("button", { name: "Request a demo" }).click();
  await expect(
    product.getByText(
      "Thank you. We will be in touch within two working days.",
    ),
  ).toBeVisible();
  await visitor.close();

  await signInAs(page, OWNER);
  const planName = `Standard ${unique()}`;
  await addPlan(page, planName);
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page
    .getByRole("region", { name: "Pipeline" })
    .getByRole("link", { name: school })
    .click();
  await expect(page.getByText("Demo form")).toBeVisible();

  await page.getByRole("button", { name: "Edit lead details" }).click();
  const details = page.getByRole("form", { name: "Edit lead details" });
  await details.getByLabel("Country").fill("EG");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await page.getByRole("button", { name: "Plan the next step" }).click();
  const next = page.getByRole("form", { name: "Next step" });
  await choose(next, "Owner", OWNER.name);
  await next.getByLabel("What").fill("Send the quote");
  await next.getByLabel("By").fill(businessToday());
  await next.getByRole("button", { name: "Save next step" }).click();
  await expect(page.getByText("Next step saved.")).toBeVisible();
  await page.getByRole("button", { name: "Log activity" }).click();
  const activity = page.getByRole("form", { name: "Log activity" });
  await activity.getByLabel("Note").fill("Showed the gradebook and coding");
  await activity.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText("Logged.")).toBeVisible();

  await page.getByRole("tab", { name: /^Quotes/ }).click();
  await page.getByRole("link", { name: "New quote" }).click();
  const quote = page.getByRole("form", { name: "Quote" });
  await choose(quote, "Plan", `${planName} version 1`);
  await expect(quote.getByLabel("Unit price (EGP)")).toHaveValue("350.00");
  await quote.getByLabel("Quantity").fill("300");
  await quote.getByRole("button", { name: "Save the quote" }).click();
  await expect(
    page.getByRole("heading", { name: /^Quote Q-\d{4}-\d{4}/ }),
  ).toBeVisible();
  // 300 at 350.00 is 105,000.00, and 14% VAT makes 119,700.00.
  const document = page.getByRole("article", { name: /^Quote Q-/ });
  await expect(document).toContainText("105,000.00");
  await expect(document).toContainText("VAT (14%)");
  await expect(document).toContainText("119,700.00");
  await expect(document).toContainText("Acme Learning");

  await page.getByRole("button", { name: "Arabic" }).click();
  const arabic = page.getByRole("article", { name: /^عرض سعر/ });
  await expect(arabic).toHaveAttribute("dir", "rtl");
  await expect(arabic).toContainText("ضريبة القيمة المضافة");
  await expect(arabic).toContainText("أكمي للتعليم");
  // Printed, the console's own header and controls are left off the page.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(arabic).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Mark as sent" }).click();
  await expect(
    page.getByText("Marked as sent. A change now makes a new version."),
  ).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Make a new version" }).click();
  await quote.getByLabel("Discount (%)").fill("10");
  await quote.getByRole("button", { name: "Save as a new version" }).click();
  await expect(page.getByRole("heading", { name: /-v2/ })).toBeVisible();
  await expect(page.getByText(/^Versions:/)).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Record acceptance" }).click();
  const acceptance = page.getByRole("form", { name: "Record acceptance" });
  await acceptance.getByLabel("Signed copy or purchase order").setInputFiles({
    name: "signed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% signed by the school\n"),
  });
  await acceptance.getByRole("button", { name: "Record acceptance" }).click();
  await expect(
    page.getByText("Accepted. Its school is ready to set up."),
  ).toBeVisible();
  await expect(page.getByRole("form", { name: "Schools" })).toBeVisible();
  await expect(page.getByText(school).first()).toBeVisible();

  await page.goto("/customers");
  await page.getByRole("link", { name: school }).click();
  await page.getByRole("tab", { name: /^Contacts/ }).click();
  await expect(
    page
      .getByRole("table", { name: "Contacts" })
      .getByRole("row", { name: /Salama Ashoush/ }),
  ).toBeVisible();
});

test("a quote sent with its link is accepted by the school, which is set up at once", async ({
  browser,
  page,
}) => {
  await signInAs(page, OWNER);
  await businessDetails(page);
  const planName = `Standard ${unique()}`;
  await addPlan(page, planName);
  const tag = unique();
  const school = `Cedar Hill ${tag}`;
  const slug = `cedar-${tag}`;
  const decider = `head@cedar-${tag}.example.com`;
  const administrator = `office@cedar-${tag}.example.com`;

  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByRole("button", { name: "New lead" }).click();
  const lead = page.getByRole("form", { name: "New lead" });
  await lead.getByLabel("School or group").fill(school);
  await lead.getByLabel("Person").fill("Salama Ashoush");
  await lead.getByLabel("Email").fill(decider);
  await lead.getByLabel("Country").fill("EG");
  await lead.getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByText("Lead added.")).toBeVisible();

  await page.getByRole("tab", { name: /^Quotes/ }).click();
  await page.getByRole("link", { name: "New quote" }).click();
  const quote = page.getByRole("form", { name: "Quote" });
  await choose(quote, "Plan", `${planName} version 1`);
  await quote.getByLabel("Quantity").fill("120");
  await quote.getByRole("button", { name: "Save the quote" }).click();
  await expect(
    page.getByRole("heading", { name: /^Quote Q-\d{4}-\d{4}/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send to the customer" }).click();
  const send = page.getByRole("form", { name: "Send to the customer" });
  await expect(send.getByLabel("Their email")).toHaveValue(decider);
  await expect(send.getByLabel("School's name in English")).toHaveValue(school);
  await send.getByLabel("Portal address").fill(slug);
  await send.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(`Sent to ${decider}.`)).toBeVisible();
  await expect(page.getByText(`Sent to Salama Ashoush`)).toBeVisible();

  const email = await sentTo(decider, "/offer/");
  const link = /(https?:\/\/\S+\/offer\/\S+)/.exec(email?.text ?? "")?.[1];
  expect(link).toBeTruthy();

  // The customer, signed in to nothing, reads it and accepts.
  const visitor = await browser.newContext();
  const customer = await visitor.newPage();
  await customer.goto(link ?? "");
  await expect(
    customer.getByRole("heading", { name: /^Quote Q-/ }),
  ).toBeVisible();
  await expect(
    customer.getByRole("article", { name: /^Quote Q-/ }),
  ).toContainText(school);
  await expect(customer.getByText(`${slug}.`)).toBeVisible();
  const terms = customer.getByRole("link", { name: "Read it" }).first();
  await expect(terms).toHaveAttribute("href", /\/legal\/terms\//);
  const form = customer.getByRole("form", { name: "Acceptance" });
  await hydrated(form);
  await form.getByLabel("Tax registration number").fill("555-666-777");
  await form.getByLabel("Your title").fill("Head of school");
  await form.getByLabel("First name").fill("Mona");
  await form.getByLabel("Last name").fill("Hassan");
  await form.getByLabel("Their email").fill(administrator);
  await form.getByRole("button", { name: "Accept" }).click();
  await expect(form.getByText("Tick the box to accept.")).toBeVisible();
  await form.getByRole("checkbox", { name: /^I accept quote/ }).check();
  await form.getByRole("button", { name: "Accept" }).click();
  await expect(
    customer.getByRole("heading", { name: "Your school is ready" }),
  ).toBeVisible({ timeout: 60_000 });
  await sentTo(administrator, "/welcome#");
  await sentTo(decider, "acceptance of quote");

  // The same link now says it was accepted.
  await customer.reload();
  await expect(
    customer.getByText("This quote has been accepted. Thank you.").first(),
  ).toBeVisible();
  await visitor.close();

  // The console has the customer, its agreements, the school and the lead won.
  await page.reload();
  await expect(
    recordHeader(page).getByText("Accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Through its link by Salama Ashoush/),
  ).toBeVisible();
  await page.goto("/customers");
  await page.getByRole("link", { name: school }).click();
  await expect(
    page.getByText("By Salama Ashoush, through their link").first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Schools/ }).click();
  await expect(
    page
      .getByRole("table", { name: "Schools" })
      .getByRole("link", { name: school }),
  ).toBeVisible();
});

test("a school's administrator asks about a module its plan does not have, and the console has the lead", async ({
  browser,
  page,
}) => {
  const portalContext = await browser.newContext();
  const school = await portalContext.newPage();
  await signInWith(
    school,
    "principal.fernhill@fernhill.example.com",
    PASSWORD,
    "/today",
    "fernhill",
  );
  await school.goto(`${portal("fernhill")}/settings`);
  const coding = school
    .getByRole("listitem")
    .filter({ hasText: "Coding and blocks" });
  await coding.getByRole("button", { name: "Ask about this" }).click();
  await expect(coding.getByText("Asked. We will be in touch.")).toBeVisible();
  await portalContext.close();

  await signInAs(page, OWNER);
  // Leads that came from a school asking about a module, as Came from filters them.
  await page.goto(
    `/leads?source=${encodeURIComponent(JSON.stringify(["module_interest"]))}`,
  );
  const lead = page
    .getByRole("region", { name: "Pipeline" })
    .getByRole("listitem")
    .filter({ hasText: "Fernhill" })
    .first();
  await lead.getByRole("link").click();
  await expect(page.getByText(/asked about Coding and blocks/i)).toBeVisible();
});

test("a quote sells add-ons, each chosen and priced in its own sheet", async ({
  page,
}) => {
  await signInAs(page, OWNER);
  await page.goto("/catalogue");
  const menu = page.getByRole("button", { name: "More actions" });
  await hydrated(menu);
  await menu.click();
  await page.getByRole("menuitem", { name: "New add-on" }).click();
  const addOn = page.getByRole("form", { name: "New add-on" });
  const addOnName = `Tutoring ${unique()}`;
  await addOn.getByLabel("Code").fill(`e2e_${unique()}`);
  await addOn.getByLabel("Name in English").fill(addOnName);
  await addOn.getByLabel("Name in Arabic").fill("الدروس");
  await choose(addOn, "Kind", "Service");
  await addOn.getByRole("button", { name: "Add price" }).click();
  const price = page.getByRole("form", { name: "Add a price" });
  await choose(price, "Charged", "per school a year");
  await price.getByLabel("Amount (EGP)").fill("1200");
  await price.getByRole("button", { name: "Add price" }).click();
  await addOn.getByLabel("Why").fill("Sold beside the plan");
  await addOn.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Add-on saved.")).toBeVisible();

  await page.goto("/customers");
  await page.getByRole("button", { name: "New customer" }).click();
  const customer = page.getByRole("form", { name: "New customer" });
  const name = `Rowan ${unique()}`;
  await customer.getByLabel("Legal name in English").fill(name);
  await customer.getByLabel("Why").fill("Asked for tutoring");
  await customer.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const customerId = new URL(page.url()).pathname.split("/").at(-1) ?? "";

  await page.goto(`/quotes/new?customerId=${customerId}`);
  const quote = page.getByRole("form", { name: "Quote" });
  await quote.getByRole("button", { name: "Add add-on" }).click();
  const adding = page.getByRole("form", { name: "Add an add-on" });
  await choose(adding, "Add-on", `${addOnName} version 1`);
  await expect(adding.getByLabel("Unit price (EGP)")).toHaveValue("1200.00");
  await adding.getByLabel("Quantity").fill("2");
  await adding.getByLabel("Discount (%)").fill("25");
  // 2 at 1,200.00 less 25% is 1,800.00.
  await expect(adding).toContainText("EGP 1,800.00");
  await adding.getByRole("button", { name: "Add add-on" }).click();
  const addOns = quote.getByRole("table", { name: "Add-ons" });
  const row = addOns.getByRole("row", { name: new RegExp(addOnName) });
  await expect(row).toContainText("EGP 1,800.00");
  await addOns
    .getByRole("button", { name: `Edit ${addOnName} version 1` })
    .click();
  const changing = page.getByRole("form", {
    name: `Edit ${addOnName} version 1`,
  });
  await changing.getByLabel("Discount (%)").fill("0");
  await changing.getByRole("button", { name: "Save add-on" }).click();
  await expect(row).toContainText("EGP 2,400.00");
  await quote.getByRole("button", { name: "Save the quote" }).click();
  // 2,400.00 and 14% VAT makes 2,736.00.
  const document = page.getByRole("article", { name: /^Quote Q-/ });
  await expect(document).toContainText(addOnName);
  await expect(document).toContainText("2,736.00");
});
