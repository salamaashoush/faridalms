import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { signWebhook } from "../apps/api/src/notifications/resend-inbox";
import {
  API_ORIGIN as api,
  RESEND_STAND_IN as resend,
  sentTo,
  WEBHOOK_SECRET as secret,
} from "./fixtures/mail";
import { openWith, signIn, untilHydrated } from "./fixtures/sign-in";

/** Resend calling the API's webhook, signed with the gate's secret. */
async function signed(event: object) {
  const body = JSON.stringify(event);
  const svixId = `msg_${crypto.randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const response = await fetch(`${api}/callbacks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": svixId,
      "svix-timestamp": String(timestamp),
      "svix-signature": signWebhook({ secret, id: svixId, timestamp, body }),
    },
    body,
  });
  return (await response.json()) as { outcome?: string };
}

/** Mail arriving at a conversation's reply address. */
async function mailArrives(input: { from: string; to: string; text: string }) {
  const id = crypto.randomUUID();
  await fetch(`${resend}/e2e/received`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "email",
      id,
      from: input.from,
      to: [input.to],
      subject: "Re: your enquiry",
      text: input.text,
      html: null,
      headers: {},
      message_id: `<${id}@mail.example.org>`,
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
      attachments: [],
    }),
  });
  return signed({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: id, to: [input.to], from: input.from },
  });
}

/** Logs an enquiry at the desk and opens it, with its conversation below. */
async function logEnquiry(page: Page, name: string, address: string) {
  await page.goto("/admissions/enquiries");
  await untilHydrated(page);
  const sheet = page.getByRole("dialog", { name: "Log an enquiry" });
  await openWith(page.getByRole("button", { name: "Log enquiry" }), sheet);
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await sheet.getByRole("textbox", { name: "Email" }).fill(address);
  await sheet.getByRole("button", { name: "Save enquiry" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await untilHydrated(page);
}

/** Writes to the family from the enquiry's conversation and answers the email it became. */
async function writeToFamily(page: Page, address: string, words: string) {
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type(words);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Messages" }).getByText(words),
  ).toBeVisible();
  return sentTo(address, words);
}

test("held mail from the family's other address is let in as theirs", async ({
  page,
  browserName,
}) => {
  test.setTimeout(150_000);
  const tag = `${browserName}-${crypto.randomUUID().slice(0, 6)}`;
  const name = `Salama Ashoush ${tag}`;
  const address = `salama.${tag}@example.com`;
  await signIn(page, "admin");
  await logEnquiry(page, name, address);
  const email = await writeToFamily(page, address, `Hello (${tag}).`);
  const words = `Writing from work: Thursday suits us (${tag}).`;
  expect(
    await mailArrives({
      from: `salama.work.${tag}@example.org`,
      to: email?.reply_to?.[0] ?? "",
      text: words,
    }),
  ).toEqual({ outcome: "held" });
  await page.reload();
  await untilHydrated(page);
  await page
    .getByRole("button", { name: "Accept as the family's message" })
    .click();
  await expect(
    page.getByText("Accepted into the conversation as the family's message"),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Messages" }).getByText(words),
  ).toHaveCount(2);
});

test("a bounce tells the team before it writes again", async ({
  page,
  browserName,
}) => {
  test.setTimeout(150_000);
  const tag = `${browserName}-${crypto.randomUUID().slice(0, 6)}`;
  const name = `Salama Ashoush ${tag}`;
  const address = `salama.${tag}@example.com`;
  await signIn(page, "admin");
  await logEnquiry(page, name, address);
  const email = await writeToFamily(page, address, `Hello (${tag}).`);
  const tenant = email?.tags?.find((tagged) => tagged.name === "tenant");
  expect(tenant?.value).toBeTruthy();
  expect(
    await signed({
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        to: [address],
        bounce: { type: "Permanent", subType: "General" },
        tags: { tenant: tenant?.value },
      },
    }),
  ).toEqual({ outcome: "unreachable" });
  await page.reload();
  await untilHydrated(page);
  await expect(
    page.getByText(`Mail to ${address} bounced`, { exact: false }),
  ).toBeVisible();
});

test("two contacts of one family are merged from the conversation", async ({
  page,
  browserName,
}) => {
  test.setTimeout(150_000);
  const tag = `${browserName}-${crypto.randomUUID().slice(0, 6)}`;
  const name = `Salama Ashoush ${tag}`;
  const home = `salama.home.${tag}@example.com`;
  const work = `salama.work.${tag}@example.org`;
  await signIn(page, "admin");
  await logEnquiry(page, `${name} at work`, work);
  await logEnquiry(page, name, home);
  const members = page.getByRole("dialog", {
    name: "People in this conversation",
  });
  await openWith(
    page.getByRole("button", { name: /People in this conversation/ }),
    members,
  );
  await members
    .getByRole("button", { name: "Another address of this family…" })
    .click();
  await members
    .getByRole("combobox", { name: "The family's other contact" })
    .click();
  await page
    .getByRole("combobox", { name: "Search by name, email or phone" })
    .fill(work);
  await page.getByRole("option", { name: new RegExp(work) }).click();
  await members.getByRole("button", { name: `Merge into ${name}` }).click();
  await expect(members.getByText(`Also writes from ${work}`)).toBeVisible();
});

test("a team finds a conversation by its own note", async ({
  page,
  browserName,
}) => {
  test.setTimeout(120_000);
  const tag = `${browserName}${crypto.randomUUID().slice(0, 6)}`;
  const name = `Salama Ashoush ${tag}`;
  await signIn(page, "admin");
  await logEnquiry(page, name, `salama.${tag}@example.com`);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type(`Wants the ${tag} orchard tour.`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto(`/search?q=${tag}&kind=notes`);
  await untilHydrated(page);
  // A team conversation is titled by its subject; the note that matched
  // is the hit's excerpt.
  await page
    .getByRole("link", { name: new RegExp(`Wants the ${tag} orchard tour`) })
    .click();
  await expect(page).toHaveURL(/\/messages\?thread=/);
  await expect(
    page
      .getByRole("list", { name: "Messages" })
      .getByText(`Wants the ${tag} orchard tour.`),
  ).toBeVisible();
});
