import type { Page } from "@playwright/test";

import { test as base, expect } from "@playwright/test";

import { apiAs, apiClient } from "./fixtures/api";
import { RESEND_STAND_IN } from "./fixtures/mail";
import { signInWith } from "./fixtures/sign-in";

const test = base.extend<{ origin: (host: string) => string }>({
  origin: async ({ baseURL }, provide) => {
    const port = new URL(baseURL ?? "http://127.0.0.1").port;
    await provide((host) => `http://${host}${port ? `:${port}` : ""}`);
  },
});

async function choose(page: Page, field: string, option: string) {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** An intake of its own that takes any age, open every day the spec runs. */
async function anyAgeIntake(run: string) {
  const admin = await apiAs("admin");
  const form = (await admin.intakes.forms()).forms.find(
    (row) => row.published !== null,
  );
  if (!form) throw new Error("the seed has no published form");
  const title = `Evening course ${run}`;
  await admin.intakes.saveIntake({
    expectedVersion: 0,
    titleEn: title,
    titleAr: "",
    startsOn: "2099-09-01",
    opensOn: "2020-01-01",
    closesOn: "2099-08-31",
    capacity: 20,
    formId: form.id,
    checklist: [],
    currency: "EGP",
    fees: [],
    decisionsOn: "",
    offerDays: 14,
    ageCutoffOn: "2099-09-01",
    minAgeMonths: null,
    maxAgeMonths: null,
    priorities: [],
  });
  return title;
}

/** The last link the stand-in for Resend carried to an address. */
async function lastLink(address: string) {
  let link = "";
  await expect
    .poll(async () => {
      const sent = (await (
        await fetch(
          `${RESEND_STAND_IN}/e2e/sent?to=${encodeURIComponent(address)}`,
        )
      ).json()) as { text?: string }[];
      link =
        /https?:\/\/\S+\/welcome\S*/.exec(sent.at(-1)?.text ?? "")?.[0] ?? "";
      return link;
    })
    .toContain("/welcome");
  return new URL(link);
}

const PASS_PHRASE = "a long enough pass phrase";

test("an adult registers and applies for themself with no family step", async ({
  browser,
  origin,
}) => {
  const run = crypto.randomUUID().slice(0, 6);
  const intake = await anyAgeIntake(run);
  const portal = origin("northwind.localhost");
  const address = `salama.self.${run}@example.com`;
  const page = await (await browser.newContext()).newPage();
  await page.clock.install();
  await page.goto(`${portal}/register`);
  await page.getByRole("radio", { name: "Myself" }).click();
  await page.getByRole("textbox", { name: "First name" }).fill("Salama");
  await page.getByRole("textbox", { name: "Family name" }).fill("Ashoush");
  await page.getByRole("textbox", { name: "Email" }).fill(address);
  await page.clock.fastForward(5000);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  const sent = await lastLink(address);
  await page.goto(`${portal}${sent.pathname}${sent.search}${sent.hash}`);
  await page.getByLabel("New password").fill(PASS_PHRASE);
  await page.getByLabel("Type it again").fill(PASS_PHRASE);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.getByRole("link", { name: "Go to sign-in" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(address);
  await page.getByRole("textbox", { name: "Password" }).fill(PASS_PHRASE);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);

  await page.goto(`${portal}/apply`);
  await expect(page.getByRole("radio", { name: "Myself" })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Child" })).toHaveCount(0);
  await choose(page, "Applying for", intake);
  await page.getByRole("button", { name: "Start the application" }).click();

  await expect(page.getByRole("heading", { name: "Applicant" })).toBeVisible();
  const steps = page.getByRole("navigation", {
    name: "Steps of the application",
  });
  await expect(steps.getByRole("button", { name: /Family/ })).toHaveCount(0);
  const arabic = page.getByRole("group", { name: "Name in Arabic" });
  await arabic.getByRole("textbox", { name: "First name" }).fill("سلامة");
  await arabic.getByRole("textbox", { name: "Family name" }).fill("عشوش");
  await page.getByLabel("Date of birth").fill("1990-02-11");
  await choose(page, "Sex", "Male");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Schools before" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "I am a parent or legal guardian of this child",
    }),
  ).toHaveCount(0);
});

test("a parent starting an application chooses to apply for themself and continues in their own space", async ({
  page,
  origin,
}) => {
  const portal = origin("northwind.localhost");
  const address = `salama.both.${crypto.randomUUID().slice(0, 6)}@example.com`;
  const visitor = apiClient();
  await visitor.applying.register({
    applyingFor: "other",
    names: {
      en: { given: "Salama", middle: "", family: "Ashoush" },
      ar: { given: "", middle: "", family: "" },
    },
    email: address,
    phone: "",
    locale: "en",
    elapsed: 5000,
  });
  const secret = (await lastLink(address)).hash.slice(1);
  await visitor.identity.acceptInvite({ secret, password: PASS_PHRASE });
  await signInWith(page, address, PASS_PHRASE, "/family");

  await page.goto(`${portal}/apply`);
  await expect(
    page.getByRole("radio", { name: "My child, or someone in my care" }),
  ).toBeChecked();
  await expect(
    page.getByRole("group", { name: "Name in English" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Myself" }).click();
  await expect(
    page.getByRole("button", { name: "Start the application" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("radio", { name: "Myself" })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Start the application" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Name in English" }),
  ).toHaveCount(0);
});
