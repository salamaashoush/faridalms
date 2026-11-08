import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

/** A small PNG of its own, so no other run's upload shares its bytes. */
function picture(name: string): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
  ]);
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.concat([header, Buffer.from(crypto.randomUUID())]),
  };
}

/** Drops files on the page as a person dragging them from their desktop does. */
async function drop(page: Page, files: ReturnType<typeof picture>[]) {
  const transfer = await page.evaluateHandle(
    (given) => {
      const data = new DataTransfer();
      for (const file of given)
        data.items.add(
          new File([new Uint8Array(file.bytes)], file.name, {
            type: file.mimeType,
          }),
        );
      return data;
    },
    files.map((file) => ({ ...file, bytes: [...file.buffer] })),
  );
  const zone = page.getByRole("heading", { name: "Media library", level: 1 });
  await zone.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.getByText("Drop to add to the library")).toBeVisible();
  await zone.dispatchEvent("drop", { dataTransfer: transfer });
}

test("the office drops pictures into the library, tags them and finds them by tag", async ({
  page,
  browserName,
}) => {
  const run = `${browserName}-${crypto.randomUUID().slice(0, 6)}`;
  const tag = `Trip ${run}`;
  await signIn(page, "admin");
  await page.goto("/media");
  await untilHydrated(page);
  await drop(page, [picture(`museum-${run}.png`), picture(`bus-${run}.png`)]);
  const grid = page.getByRole("list", { name: "Media library" });
  await expect(grid.getByText(`museum-${run}.png`)).toBeVisible();
  await expect(grid.getByText(`bus-${run}.png`)).toBeVisible();

  await page
    .getByRole("checkbox", { name: `Select museum-${run}.png` })
    .click();
  await page.getByRole("checkbox", { name: `Select bus-${run}.png` }).click();
  await expect(
    page.getByText("2 selected", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tags" }).first().click();
  await page.getByRole("textbox", { name: "Add tags" }).fill(tag);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: new RegExp(tag) }).click();
  await expect(page).toHaveURL(/tags=/);
  await expect(grid.getByRole("listitem")).toHaveCount(2);

  // Describing one gives it a title shown in place of its file name.
  await grid
    .getByRole("listitem")
    .filter({ hasText: `museum-${run}.png` })
    .getByRole("button", { name: /Actions for/ })
    .click();
  await page.getByRole("menuitem", { name: "Describe" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(`Museum ${run}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(grid.getByText(`Museum ${run}`)).toBeVisible();
});

test("an upload cut off by a reload is picked up and finished", async ({
  page,
  browserName,
}) => {
  const name = `reloaded-${browserName}-${crypto.randomUUID().slice(0, 6)}.png`;
  await signIn(page, "admin");
  await page.goto("/media");
  await untilHydrated(page);
  // The bytes never arrive the first time: the page is reloaded mid-upload.
  await page.route("**/files/*", (route) =>
    route.request().method() === "PUT" ? undefined : route.continue(),
  );
  await drop(page, [picture(name)]);
  await expect(page.getByRole("list", { name: "Uploading" })).toContainText(
    name,
  );
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await untilHydrated(page);
  await expect(
    page.getByRole("list", { name: "Media library" }).getByText(name),
  ).toBeVisible();
});
