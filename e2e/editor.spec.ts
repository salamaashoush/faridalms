import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

/** A 64 by 48 JPEG, small enough to carry here and real enough to draw. */
const PICTURE = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMC/8QAFRABAQAAAAAAAAAAAAAAAAAAABL/xAAWAQEBAQAAAAAAAAAAAAAAAAAABQb/xAAWEQEBAQAAAAAAAAAAAAAAAAAAExT/2gAMAwEAAhEDEQA/AMwQtJLSa0iCMELSSayCMELSSayCMELSSayC0krQQymtbgjJK0EGsgjJK0EGsgjJK0EGsgvJK0ksprXIIyStJJrIIyStJJrIIyStJJrIP//Z",
  "base64",
);

const unique = (label: string, browserName: string) =>
  `${label} (${browserName} ${crypto.randomUUID().slice(0, 6)})`;

async function newPost(page: Page, title: string) {
  await page.goto("/news-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  const body = page.locator("#news-body");
  await body.click();
  return body;
}

async function insertPicture(page: Page) {
  await page.keyboard.type("/picture");
  await page.keyboard.press("Enter");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload from this device" }).click();
  await (
    await chooser
  ).setFiles({ name: "sky.jpg", mimeType: "image/jpeg", buffer: PICTURE });
  await expect(page.locator("#news-body img")).toHaveAttribute(
    "src",
    /\/files\/[0-9a-f-]{36}/,
  );
}

test("a picture's bar is reached, used and left with the keyboard alone", async ({
  page,
  browserName,
}) => {
  await signIn(page, "admin");
  await newPost(page, unique("Keyboard", browserName));
  await page.keyboard.type("Above the picture.");
  await page.keyboard.press("Enter");
  await insertPicture(page);

  await page.locator("#news-body > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  const bar = page.getByRole("toolbar", { name: "Block options" });
  await expect(bar).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(bar.getByRole("link", { name: "Download" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    bar.locator("a[href], button:not([disabled])").last(),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(bar.getByRole("link", { name: "Download" })).toBeFocused();

  // Escape goes back to the text with the picture still chosen.
  await page.keyboard.press("Escape");
  await expect(page.locator("#news-body")).toBeFocused();
  await expect(bar).toBeVisible();

  await page.keyboard.press("Alt+F10");
  await expect(bar.getByRole("link", { name: "Download" })).toBeFocused();
  const size = bar.getByRole("button", { name: "Size" });
  // Arrows walk the bar one control at a time until Size.
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect(size).toBeFocused({ timeout: 200 });
  }).toPass();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Medium" }).press("Enter");
  await expect(page.locator("#news-body figure")).toHaveClass(/sm:w-1\/2/);
  await expect(page.locator("#news-body")).toBeFocused();
});

test("a draft titled like a post already written still saves its words", async ({
  page,
  browserName,
}) => {
  const title = unique("Same title", browserName);
  await signIn(page, "admin");
  await newPost(page, title);
  await page.keyboard.type("The first post.");
  await expect(page).toHaveURL(/id=/);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await newPost(page, title);
  await page.keyboard.type("The second post, under the same title.");
  await expect(page).toHaveURL(/id=/);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await untilHydrated(page);
  await expect(page.locator("#news-body")).toContainText(
    "The second post, under the same title.",
  );
});

test("words typed while saving fails are kept and saved once it works", async ({
  page,
  browserName,
}) => {
  await signIn(page, "admin");
  await newPost(page, unique("Offline", browserName));
  await page.keyboard.type("Saved first.");
  await expect(page).toHaveURL(/id=/);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  let failing = true;
  await page.route("**/_serverFn/**", (route) =>
    failing &&
    Buffer.from(route.request().url().split("/_serverFn/")[1] ?? "", "base64")
      .toString()
      .includes("saveNews")
      ? route.abort("internetdisconnected")
      : route.continue(),
  );
  await page.keyboard.type(" Typed while it failed.");
  await expect(page.getByText("Couldn't save")).toBeVisible();

  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await untilHydrated(page);
  await expect(page.locator("#news-body")).toHaveText(
    "Saved first. Typed while it failed.",
  );
});
