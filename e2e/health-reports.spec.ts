import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser follows its own family, so parallel projects never read each
// other's reports.
const FAMILY: Record<string, string> = {
  chromium: "parent1014@northwind.example.com",
  firefox: "parent1015@northwind.example.com",
  webkit: "parent1016@northwind.example.com",
};

const letter = (words: string) => Buffer.from(`%PDF-1.4\n${words}\n`);

test("the health staff attach a report, the family sees it is held, and opens it once shared", async ({
  browser,
  page,
  browserName,
}) => {
  const condition = `Asthma ${browserName} ${crypto.randomUUID().slice(0, 6)}`;
  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(
    family,
    FAMILY[browserName] ?? FAMILY.chromium ?? "",
    PASSWORD,
    "/family",
  );
  await family.goto("/family/children");
  await untilHydrated(family);
  await family.getByRole("link", { name: "Medical summary" }).first().click();
  await expect(family).toHaveURL(/\/family\/health\?studentId=/);
  const studentId = new URL(family.url()).searchParams.get("studentId") ?? "";

  await signIn(page, "admin");
  await page.goto(`/students/${studentId}?tab=health`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add health record" }).click();
  const sheet = page.getByRole("dialog", { name: "Add health record" });
  await sheet.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Chronic condition" }).click();
  await sheet.getByRole("textbox", { name: "Details" }).fill(condition);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: `Actions for ${condition}` }).click();
  await page.getByRole("menuitem", { name: "Attach a report" }).click();
  const attach = page.getByRole("dialog", { name: "Attach a report" });
  await attach.getByRole("button", { name: "Save" }).click();
  await expect(attach.getByText("Choose the report to upload")).toBeVisible();
  await attach.locator("input[type=file]").setInputFiles({
    name: "Respiratory clinic letter.pdf",
    mimeType: "application/pdf",
    buffer: letter("Inhaler before sport."),
  });
  await expect(
    attach.getByRole("button", {
      name: /^Open: Respiratory clinic letter\.pdf/,
    }),
  ).toBeVisible();
  await attach.getByRole("button", { name: "Save" }).click();
  await expect(attach).toHaveCount(0);
  await expect(
    page.getByText("Respiratory clinic letter.pdf").first(),
  ).toBeVisible();
  await expect(page.getByText("Not shared with the family")).toBeVisible();

  await family.reload();
  await untilHydrated(family);
  const conditions = family.getByRole("region", { name: "Medical conditions" });
  await expect(conditions.getByText(condition)).toBeVisible();
  await expect(
    conditions.getByText("The school holds a report about this."),
  ).toBeVisible();
  await expect(
    conditions.getByText("Respiratory clinic letter.pdf"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: `Actions for ${condition}` }).click();
  await page.getByRole("menuitem", { name: "Share with the family" }).click();
  await expect(page.getByText("Shared with the family")).toBeVisible();

  await family.reload();
  await untilHydrated(family);
  const download = conditions.getByRole("link", {
    name: /^Download: Respiratory clinic letter\.pdf/,
  });
  await expect(download).toBeVisible();
  const opened = await family.request.get(
    new URL((await download.getAttribute("href")) ?? "", family.url()).href,
  );
  expect(opened.status()).toBe(200);
  expect(await opened.text()).toContain("Inhaler before sport.");
  await familyContext.close();
});
