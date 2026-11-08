import { expect, test } from "@playwright/test";

import { signWebhook } from "../apps/api/src/notifications/resend-inbox";
import {
  API_ORIGIN as api,
  RESEND_STAND_IN as resend,
  sentTo,
  WEBHOOK_SECRET as secret,
} from "./fixtures/mail";
import { openWith, signIn, untilHydrated } from "./fixtures/sign-in";

/** The family answers by email: Resend receives it and tells the API, signed. */
async function familyAnswers(input: {
  from: string;
  to: string;
  text: string;
}) {
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
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: id, to: [input.to], from: input.from },
  });
  const svixId = `msg_${id}`;
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

test("the office answers an enquiry by email and the family's reply lands in the conversation", async ({
  page,
  browserName,
}) => {
  test.setTimeout(150_000);
  const tag = `${browserName}-${crypto.randomUUID().slice(0, 6)}`;
  const name = `Salama Ashoush ${tag}`;
  const address = `salama.${tag}@example.com`;
  await signIn(page, "admin");
  await page.goto("/admissions/enquiries");
  await untilHydrated(page);
  const sheet = page.getByRole("dialog", { name: "Log an enquiry" });
  await openWith(page.getByRole("button", { name: "Log enquiry" }), sheet);
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await sheet.getByRole("textbox", { name: "Email" }).fill(address);
  await sheet.getByRole("button", { name: "Save enquiry" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await untilHydrated(page);

  const reply = `We would be glad to show you round (${tag}).`;
  await expect(
    page.getByText(
      "The family also receives this by email, and can answer it.",
    ),
  ).toBeVisible();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type(reply);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const messages = page.getByRole("list", { name: "Messages" });
  await expect(messages.getByText(reply)).toBeVisible();
  await expect(
    page.getByText("In progress after the first contact"),
  ).toBeVisible();

  const email = await sentTo(address, reply);
  const replyTo = email?.reply_to?.[0] ?? "";
  expect(replyTo).toMatch(/^r\+[0-9a-f]{32}\.[a-z2-7]{26}@reply\.localhost$/);
  expect(email?.subject).toContain("Your enquiry to");

  const answer = `Tuesday at ten suits us (${tag}).`;
  expect(
    await familyAnswers({
      from: `${name} <${address}>`,
      to: replyTo,
      text: `${answer}\n\nOn Mon, 2 Nov 2026, the school wrote:\n> ${reply}`,
    }),
  ).toEqual({ outcome: "posted" });
  await page.reload();
  await expect(messages.getByText(answer)).toBeVisible();
  await expect(messages.getByText("By email").first()).toBeVisible();

  // The same conversation is in the admissions mailbox in Messages.
  await page.goto("/messages?box=admissions");
  await untilHydrated(page);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await expect(
    page.getByRole("list", { name: "Messages" }).getByText(answer),
  ).toBeVisible();
});
