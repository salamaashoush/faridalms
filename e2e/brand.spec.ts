import type { Page } from "@playwright/test";

import { portalAccent } from "@faridalms/domain/portal-face";
import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  portal,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
};

/** The colours the sign-in page paints: its band, and its sign-in button with its words. */
async function signInColours(page: Page, school: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${portal(school)}/sign-in`);
  const band = page.locator("aside").first();
  const button = page.getByRole("button", { name: "Sign In", exact: true });
  await expect(button).toBeEnabled();
  await expect(band).toBeVisible();
  return {
    band: await band.evaluate((node) => getComputedStyle(node).backgroundColor),
    words: await band.evaluate((node) => getComputedStyle(node).color),
    button: await button.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    ),
    buttonWords: await button.evaluate((node) => getComputedStyle(node).color),
  };
}

test("each school's sign-in shows its own brand colour: Lanternfield's violet, Northwind's blue as before", async ({
  page,
}) => {
  const northwind = await signInColours(page, "northwind");
  expect(northwind).toEqual({
    band: rgb("#0B3D91"),
    words: rgb("#FFFFFF"),
    button: rgb(portalAccent("#0B3D91").light.primary),
    buttonWords: rgb("#FFFFFF"),
  });
  const lanternfield = await signInColours(page, "lanternfield");
  expect(lanternfield).toEqual({
    band: rgb("#6D28D9"),
    words: rgb("#FFFFFF"),
    button: rgb(portalAccent("#6D28D9").light.primary),
    buttonWords: rgb(portalAccent("#6D28D9").light.primaryForeground),
  });
  expect(lanternfield.band).not.toBe(northwind.band);
});

test("Settings refuses a brand colour the sign-in could not be read on, and offers the nearest that reads", async ({
  page,
}) => {
  await signInWith(
    page,
    "admin.lanternfield@lanternfield.example.com",
    PASSWORD,
    "/today",
    "lanternfield",
  );
  await page.goto(`${portal("lanternfield")}/settings`);
  await untilHydrated(page);
  const code = page.getByRole("textbox", { name: /^Colour code/ });
  await expect(code).toHaveValue("#6D28D9");
  const preview = page.getByTestId("brand-preview");
  await expect(preview).toHaveCSS("background-color", rgb("#6D28D9"));

  await code.fill("#808080");
  await expect(
    page.getByText(/^Words on this colour would be hard to read/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Use #[0-9A-F]{6} instead$/ })
    .click();
  await expect(
    page.getByText(/^Words on this colour would be hard to read/),
  ).toHaveCount(0);
  await expect(code).not.toHaveValue("#808080");
  await expect(preview).not.toHaveCSS("background-color", rgb("#808080"));
});
