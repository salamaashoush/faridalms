import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EditorMedia, LibraryPicture } from "./context";
import type { EditorStrings } from "./strings";

import { EditorEnvironmentProvider } from "./context";
import { PictureLibrary } from "./plugins/picture-library";

const strings = {
  pictureSearch: "Search pictures",
  pictureNone: "No pictures match",
  pictureUpload: "Upload from this device",
  pictureStyle: "Pictures to show",
  pictureLines: "Line drawings to colour",
  pictureColour: "In colour",
  pictureCollection: "Where to look",
  pictureSymbols: "Symbols and emoji",
  pictureCommons: "Wikimedia Commons",
  narrationClose: "Close",
  uploadFailed: "Upload failed",
} as EditorStrings;

const cat = (style: string): LibraryPicture => ({
  source: "openmoji",
  id: "1F431",
  label: `cat ${style}`,
  thumb: `https://example.com/${style}/1F431.svg`,
  full: `https://example.com/${style}/1F431.svg`,
});

const camel: LibraryPicture = {
  source: "commons",
  id: "File:Camel.jpg",
  label: "A camel resting",
  thumb: "https://upload.wikimedia.org/thumb/330px-Camel.jpg",
  full: "https://upload.wikimedia.org/thumb/1280px-Camel.jpg",
  alt: "A camel resting",
  credit: { author: "A. Photographer", licence: "CC BY-SA 4.0" },
};

function mount(colouring: boolean, credited = false) {
  const search = vi.fn(
    (_query: string, style = "colour", collection = "symbols") =>
      Promise.resolve(collection === "commons" ? [camel] : [cat(style)]),
  );
  const media = {
    url: (id: string) => `/files/${id}`,
    upload: () => Promise.reject(new Error("unused")),
    accept: { image: [], file: [], media: [], captions: [] },
    pictures: {
      search,
      credits: "Emoji by OpenMoji, CC BY-SA 4.0.",
      commons: { credits: "From Wikimedia Commons, each with its credit." },
    },
  } satisfies EditorMedia;
  render(
    <EditorEnvironmentProvider value={{ strings, locale: "en", media }}>
      <PictureLibrary
        colouring={colouring}
        credited={credited}
        onPick={() => Promise.resolve()}
        onUpload={() => undefined}
        onClose={() => undefined}
      />
    </EditorEnvironmentProvider>,
  );
  return search;
}

describe("the picture library", () => {
  it("offers a colouring page line drawings first, and coloured ones a tap away", async () => {
    const search = mount(true);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "cat");
    expect(
      await screen.findByRole("button", { name: "cat lines" }),
    ).toBeVisible();
    expect(search).toHaveBeenLastCalledWith("cat", "lines", "symbols");
    expect(
      screen.getByRole("button", { name: "Line drawings to colour" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "In colour" }));
    expect(
      await screen.findByRole("button", { name: "cat colour" }),
    ).toBeVisible();
    expect(search).toHaveBeenLastCalledWith("cat", "colour", "symbols");
    expect(screen.queryByRole("button", { name: "cat lines" })).toBeNull();
  });

  it("searches pictures in colour, with no choice, for anything else", async () => {
    const search = mount(false);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "cat");
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith("cat", "colour", "symbols"),
    );
    expect(
      screen.queryByRole("group", { name: "Pictures to show" }),
    ).toBeNull();
  });

  it("offers Wikimedia Commons only where a picked picture keeps its credit", async () => {
    const search = mount(false, true);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "camel");
    await user.click(screen.getByRole("button", { name: "Wikimedia Commons" }));
    expect(
      await screen.findByRole("button", { name: "A camel resting" }),
    ).toBeVisible();
    expect(search).toHaveBeenLastCalledWith("camel", "colour", "commons");
    expect(
      screen.getByText("From Wikimedia Commons, each with its credit."),
    ).toBeVisible();
  });

  it("leaves Wikimedia Commons out where a picked picture would lose its credit", () => {
    mount(false);
    expect(
      screen.queryByRole("button", { name: "Wikimedia Commons" }),
    ).toBeNull();
  });
});
