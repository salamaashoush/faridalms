import type { Page } from "@playwright/test";

import { test as base, expect } from "@playwright/test";

import { apiAs } from "./fixtures/api";
import { RESEND_STAND_IN } from "./fixtures/mail";
import { PASSWORD, signIn, signInWith } from "./fixtures/sign-in";

// The gate's web server answers every *.localhost name: <school>.localhost
// is a school's portal.
const test = base.extend<{ origin: (host: string) => string }>({
  origin: async ({ baseURL }, provide) => {
    const port = new URL(baseURL ?? "http://127.0.0.1").port;
    await provide((host) => `http://${host}${port ? `:${port}` : ""}`);
  },
});

const APPLICANT = "applicant.northwind@northwind.example.com";

/** Picks an option from one of the app's own selects. */
async function choose(page: Page, field: string, option: string) {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Moves on a step of the application, once the step has saved. */
async function next(page: Page) {
  await page.getByRole("button", { name: "Save and continue" }).click();
}

test("the office reads an application and starts its review", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Intakes" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Intakes" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "KG1" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Applications" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Applications" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Omar Ashoush" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Omar Ashoush" }),
  ).toBeVisible();
  await expect(page.getByText("2027-0001").first()).toBeVisible();
  await expect(page.getByText("Little Steps Nursery")).toBeVisible();
  await expect(page.getByText("Birth certificate")).toBeVisible();

  await page.getByRole("button", { name: "Start review" }).first().click();
  await expect(page.getByText("In review").first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "Add a note" })
    .fill("Called to arrange the play session.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByText("Called to arrange the play session."),
  ).toBeVisible();

  // Health and needs open only when asked for, since each look is recorded.
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("Additional learning needs")).toBeVisible();
});

test("a parent meets the registration form on the portal's registration page", async ({
  browser,
  origin,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.clock.install();
  await visitor.goto(`${origin("northwind.localhost")}/register`);
  await expect(
    visitor.getByRole("heading", { level: 1, name: "Register to apply" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", { name: "Questions about applying?" }),
  ).toBeVisible();
  await visitor.getByRole("textbox", { name: "First name" }).fill("Salama");
  await visitor.getByRole("textbox", { name: "Family name" }).fill("Ashoush");
  await visitor
    .getByRole("textbox", { name: "Email" })
    .fill(`salama.${crypto.randomUUID().slice(0, 6)}@example.com`);
  // A person takes a while to fill the form; faster sends are dropped as scripts.
  await visitor.clock.fastForward(5000);
  await visitor.getByRole("button", { name: "Register", exact: true }).click();
  // The gate sends email to its stand-in for Resend, so the link is on its
  // way; the API suite follows a registration through its email and link.
  await expect(
    visitor.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
});

test("a registered family applies on the apply page and sends it", async ({
  page,
  origin,
}) => {
  await signInWith(page, APPLICANT, PASSWORD, "/family");
  await page.getByRole("link", { name: "Applications" }).first().click();
  await expect(page.getByText("Omar Ashoush").first()).toBeVisible();
  await page.getByRole("link", { name: "Start an application" }).click();
  await expect(page).toHaveURL(`${origin("northwind.localhost")}/apply`);

  await choose(page, "Applying for", "Grade 1, 2027–2028");
  await choose(page, "Child", "Another child");
  const arabic = page.getByRole("group", { name: "Name in Arabic" });
  await arabic.getByRole("textbox", { name: "First name" }).fill("يوسف");
  await arabic.getByRole("textbox", { name: "Family name" }).fill("عشوش");
  const english = page.getByRole("group", { name: "Name in English" });
  await english.getByRole("textbox", { name: "First name" }).fill("Yusuf");
  await english.getByRole("textbox", { name: "Family name" }).fill("Ashoush");
  await page.getByLabel("Date of birth").fill("2021-03-01");
  await choose(page, "Sex", "Male");
  await page.getByRole("button", { name: "Start the application" }).click();

  await expect(page.getByRole("heading", { name: "Child" })).toBeVisible();
  await expect(page.getByText("Of age for this grade")).toBeVisible();
  await next(page);
  await choose(page, "You are the child's", "Father");
  await page
    .getByRole("checkbox", {
      name: "I am a parent or legal guardian of this child",
    })
    .check();
  await next(page);
  await expect(
    page.getByRole("heading", { name: "Schools before" }),
  ).toBeVisible();
  await next(page);
  await page
    .getByRole("textbox", { name: "Allergies" })
    .fill("Mild hay fever in spring.");
  await next(page);
  await choose(page, "How did you hear about the school?", "An open day");
  await next(page);
  await expect(page.getByText("Birth certificate")).toBeVisible();
  await next(page);

  await expect(
    page.getByRole("heading", { name: "Check and send" }),
  ).toBeVisible();
  for (const box of await page.getByRole("checkbox", { name: "I agree" }).all())
    await box.check();
  await page.getByRole("button", { name: "Send the application" }).click();
  await expect(
    page.getByText(/This application was sent, number 2027-/),
  ).toBeVisible();

  await page.goto(`${origin("northwind.localhost")}/family/applications`);
  await expect(page.getByText("Yusuf Ashoush").first()).toBeVisible();
  await expect(page.getByText("Submitted").first()).toBeVisible();
});

test("a family who registers from an intake's apply door comes back to that intake", async ({
  browser,
  origin,
}) => {
  const admin = await apiAs("admin");
  const [intake] = (await admin.intakes.list({})).intakes;
  if (!intake) throw new Error("seed intake");
  const portal = origin("northwind.localhost");
  const address = `salama.${crypto.randomUUID().slice(0, 6)}@example.com`;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.clock.install();
  await visitor.goto(`${portal}/apply?intake=${intake.id}`);
  await visitor.getByRole("link", { name: "Register", exact: true }).click();
  await expect(visitor).toHaveURL(`${portal}/register?intake=${intake.id}`);
  await visitor.getByRole("textbox", { name: "First name" }).fill("Salama");
  await visitor.getByRole("textbox", { name: "Family name" }).fill("Ashoush");
  await visitor.getByRole("textbox", { name: "Email" }).fill(address);
  await visitor.clock.fastForward(5000);
  await visitor.getByRole("button", { name: "Register", exact: true }).click();
  await expect(
    visitor.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  let link = "";
  await expect
    .poll(async () => {
      const sent = (await (
        await fetch(
          `${RESEND_STAND_IN}/e2e/sent?to=${encodeURIComponent(address)}`,
        )
      ).json()) as { text?: string }[];
      link =
        /https?:\/\/\S+\/welcome\?\S+/.exec(sent.at(-1)?.text ?? "")?.[0] ?? "";
      return link;
    })
    .toContain(`intake=${intake.id}`);
  // Mail names the school's canonical https host; the gate serves it here.
  const sent = new URL(link);
  await visitor.goto(`${portal}${sent.pathname}${sent.search}${sent.hash}`);
  const password = "a long enough pass phrase";
  await visitor.getByLabel("New password").fill(password);
  await visitor.getByLabel("Type it again").fill(password);
  await visitor.getByRole("button", { name: "Save password" }).click();
  await visitor.getByRole("link", { name: "Go to sign-in" }).click();
  await visitor.getByRole("textbox", { name: "Email" }).fill(address);
  await visitor.getByRole("textbox", { name: "Password" }).fill(password);
  await visitor.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(visitor).toHaveURL(`${portal}/apply?intake=${intake.id}`);
});

test("the office writes an application form's questions as blocks and publishes it", async ({
  page,
}) => {
  const name = `Bus form ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "admin");
  await page.goto("/admissions/intakes?tab=forms");
  await page.getByRole("link", { name: "New form" }).first().click();
  await expect(
    page.getByRole("heading", { name: "New application form" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Name in English" }).fill(name);
  // Only the kinds a form asks are offered, and nothing is marked.
  const questions = page.getByRole("textbox", {
    name: "The school's questions",
  });
  await questions.click();
  await page.keyboard.type("/typed");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Which bus stop is nearest your home?");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  // "date" also finds a timeline, which lists dates, so the block is picked by name.
  await page.keyboard.type("/date");
  await page.getByRole("option", { name: /^Date/ }).click();
  await page.keyboard.type("When could your child start?");
  await expect(questions.locator("[data-question]")).toHaveCount(2);
  await expect(questions.locator("[data-question][data-asked]")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/ordering");
  await expect(page.getByRole("option", { name: /Ordering/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Save and publish" }).click();
  await expect(page.getByText("Form published")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText(
    "2",
  );
});
