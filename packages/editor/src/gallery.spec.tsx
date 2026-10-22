import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { FileStrings } from "./files";

import { GalleryView } from "./pictures-view";

const strings = {
  openFile: "Open",
  picture: "Picture",
  fileRemoved: "Removed",
  downloadFile: "Download",
  copyFileLink: "Copy link",
  fileLinkCopied: "Copied",
  closeViewer: "Close",
  noPreview: "No preview",
  previousPicture: "Previous picture",
  nextPicture: "Next picture",
  pictureOf: (at: number, total: number) => `Picture ${at} of ${total}`,
} as FileStrings;

const file = (n: number) => `0190a1b2-0000-7000-8000-00000000004${n}`;

const pictures = [
  { fileId: file(1), alt: "The source", caption: "Lake Victoria" },
  { fileId: file(2), alt: "The middle", caption: "Khartoum" },
  { fileId: file(3), alt: "The mouth", caption: "The delta" },
];

describe("a gallery's large view", () => {
  it("steps through the pictures by button and key, and stops at the ends", async () => {
    const user = userEvent.setup();
    render(
      <GalleryView
        pictures={pictures}
        url={(fileId) => `/files/${fileId}`}
        strings={strings}
        locale="en"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open: Khartoum" }));
    expect(await screen.findByText("Picture 2 of 3")).toBeTruthy();
    expect(screen.getByRole("img", { name: "The middle" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next picture" }));
    expect(screen.getByText("Picture 3 of 3")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Next picture" })
        .hasAttribute("disabled"),
    ).toBe(true);

    // Keys pressed together each step, as a held arrow key repeats.
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByText("Picture 1 of 3")).toBeTruthy();
    expect(screen.getByRole("img", { name: "The source" })).toBeTruthy();
    // The first picture has none before it.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("Picture 1 of 3")).toBeTruthy();
  });
});
