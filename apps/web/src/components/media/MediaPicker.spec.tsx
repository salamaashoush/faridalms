import type { MediaChoice } from "@faridalms/editor";

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listMedia } from "~/server/media";
import { render } from "~/testUtils";

import type { MediaListing, MediaRow } from "./media-items";

import { MediaChooser } from "./MediaPicker";

vi.mock("~/server/media", () => ({
  listMedia: vi.fn(),
  mediaUses: vi.fn(),
  keepInMedia: vi.fn(),
}));

const FOLDER = "0190a1b2-0000-7000-8000-0000000000d1";

const row = (id: string, name: string, description: string): MediaRow => ({
  id,
  name,
  mediaType: "image/jpeg",
  sizeBytes: 2048,
  width: 800,
  height: 600,
  createdAt: "2026-11-01T09:00:00.000Z",
  trashedAt: null,
  folderId: null,
  description,
  title: "",
  caption: "",
  credit: null,
  uploadedBy: null,
  tags: [],
  uses: 0,
  focus: null,
  placeholder: null,
  page: false,
  pdf: false,
});

const page = (rows: MediaRow[]): MediaListing => ({
  path: [],
  folders: [{ id: FOLDER, name: "Sports day", parentId: null, items: 4 }],
  children: [{ id: FOLDER, name: "Sports day", parentId: null, items: 4 }],
  items: { rows, total: rows.length, page: 1, pages: 1, pageSize: 25 },
  kinds: { pictures: rows.length },
  facets: { months: [], uploaders: [], tags: [] },
  keeper: false,
});

function open(
  onDone: (chosen: MediaChoice[] | null) => void,
  upload?: () => void,
) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <MediaChooser
          kind="image"
          options={{ multiple: true, ...(upload ? { upload } : {}) }}
          onDone={onDone}
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("choosing from the school's media", () => {
  beforeEach(() => {
    vi.mocked(listMedia).mockReset();
  });

  it("asks only for pictures, and gives back those chosen with the media item's words", async () => {
    vi.mocked(listMedia).mockResolvedValue(
      page([
        row("0190a1b2-0000-7000-8000-0000000000a1", "relay.jpg", "The relay"),
        row("0190a1b2-0000-7000-8000-0000000000a2", "hall.jpg", ""),
      ]),
    );
    const onDone = vi.fn<(chosen: MediaChoice[] | null) => void>();
    open(onDone);
    expect(
      await screen.findByRole("button", { name: /relay\.jpg/ }),
    ).toBeInTheDocument();
    expect(vi.mocked(listMedia).mock.calls[0]?.[0]).toMatchObject({
      data: { kinds: ["pictures"], folderId: null },
    });
    await userEvent.click(screen.getByRole("button", { name: /relay\.jpg/ }));
    await userEvent.click(screen.getByRole("button", { name: /hall\.jpg/ }));
    await userEvent.click(screen.getByRole("button", { name: "Choose 2" }));
    expect(onDone).toHaveBeenCalledWith([
      {
        fileId: "0190a1b2-0000-7000-8000-0000000000a1",
        name: "relay.jpg",
        mime: "image/jpeg",
        bytes: 2048,
        alt: "The relay",
      },
      {
        fileId: "0190a1b2-0000-7000-8000-0000000000a2",
        name: "hall.jpg",
        mime: "image/jpeg",
        bytes: 2048,
        alt: "",
      },
    ]);
  });

  it("opens a folder, and offers the device's own files beside the school's media", async () => {
    vi.mocked(listMedia).mockResolvedValue(page([]));
    const onDone = vi.fn<(chosen: MediaChoice[] | null) => void>();
    const upload = vi.fn<() => void>();
    open(onDone, upload);
    await userEvent.click(
      await screen.findByRole("button", { name: /Sports day/ }),
    );
    await waitFor(() =>
      expect(vi.mocked(listMedia).mock.lastCall?.[0]).toMatchObject({
        data: { folderId: FOLDER },
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Upload from this device" }),
    );
    expect(upload).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith(null);
  });
});
