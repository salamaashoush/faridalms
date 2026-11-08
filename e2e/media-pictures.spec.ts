import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

/** A 64 by 48 JPEG, small enough to carry here and real enough to draw. */
const PICTURE = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMC/8QAFRABAQAAAAAAAAAAAAAAAAAAABL/xAAWAQEBAQAAAAAAAAAAAAAAAAAABQb/xAAWEQEBAQAAAAAAAAAAAAAAAAAAExT/2gAMAwEAAhEDEQA/AMwQtJLSa0iCMELSSayCMELSSayCMELSSayC0krQQymtbgjJK0EGsgjJK0EGsgjJK0EGsgvJK0ksprXIIyStJJrIIyStJJrIIyStJJrIP//Z",
  "base64",
);

/** The picture as a phone writes it: an EXIF block saying where it was taken. */
function withLocation(jpeg: Buffer): Buffer {
  const place = Buffer.from("GPSLatitude 30.0444N 31.2357E", "latin1");
  const tiff = Buffer.concat([
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
    Buffer.from([0x00, 0x01, 0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01]),
    Buffer.from([0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00]),
    place,
  ]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = body.length + 2;
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]),
    body,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

test("a photo loses where it was taken, shows a small size in its tile, keeps a focal point and is edited into a new picture", async ({
  page,
  browserName,
}) => {
  const name = `Assembly ${browserName} ${crypto.randomUUID().slice(0, 6)}.jpg`;
  await signIn(page, "admin");
  await page.goto("/media");
  await untilHydrated(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name,
      mimeType: "image/jpeg",
      buffer: withLocation(PICTURE),
    });
  const tile = page.getByRole("listitem").filter({ hasText: name });
  const picture = tile.locator("img");
  await expect(picture).toHaveAttribute(
    "src",
    /\/files\/[0-9a-f-]{36}\?w=320$/,
  );
  const src = (await picture.getAttribute("src")) ?? "";
  const fileId = /\/files\/([0-9a-f-]{36})/.exec(src)?.[1] ?? "";

  const kept = await page.request.get(`/files/${fileId}?download`);
  expect(kept.ok()).toBe(true);
  const bytes = await kept.body();
  expect(bytes.includes(Buffer.from("GPSLatitude", "latin1"))).toBe(false);

  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Set focal point" }).click();
  const focus = page.getByRole("dialog", { name: `Focal point of ${name}` });
  await focus
    .getByRole("button", { name: /^Focal point\./ })
    .press("ArrowRight");
  await focus.getByRole("button", { name: "Keep focal point" }).click();
  await expect(page.getByText("Focal point kept")).toBeVisible();
  await expect(picture).toHaveCSS("object-position", "55% 50%");

  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Crop, turn or resize" }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${name}` });
  await edit.getByRole("button", { name: "Turn right" }).click();
  await expect(edit.getByText("48 × 64 pixels")).toBeVisible();
  await edit.getByRole("spinbutton", { name: "Width in pixels" }).fill("24");
  await expect(edit.getByText("24 × 32 pixels")).toBeVisible();
  await edit.getByRole("button", { name: "Keep as a new picture" }).click();
  await expect(page.getByText("Kept as a new picture")).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "(edited).jpg" }).first(),
  ).toBeVisible();
});
