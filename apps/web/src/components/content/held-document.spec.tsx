import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { holdDocument } from "~/server/documents";
import { render } from "~/testUtils";

import { useHeldDocument } from "./held-document";

vi.mock("~/server/documents", () => ({
  holdDocument: vi.fn(),
  releaseDocument: vi.fn(() => Promise.resolve({ released: true })),
}));

const hold = vi.mocked(holdDocument);
const since = new Date().toISOString();
const mine = {
  mine: true,
  holder: { id: "me", nameEn: "Salama Ashoush", nameAr: null },
  since,
};
const theirs = {
  mine: false,
  holder: { id: "them", nameEn: "Amira Hassan", nameAr: null },
  since,
};

interface PageProps {
  save: (value: string, version: number) => Promise<void>;
  latest: () => Promise<{ value: string; version: number }>;
}

function Page({ save, latest }: PageProps) {
  const [value, setValue] = useState("first words");
  const version = useRef(1);
  const { editing } = useHeldDocument({
    host: { hostType: "announcement", hostId: "host" },
    value,
    save: (next) => save(next, version.current),
    delay: 10,
    version: () => version.current,
    latest,
    adopt: (stored) => {
      version.current = stored.version;
      setValue(stored.value);
    },
    rebase: (next) => {
      version.current = next;
    },
    render: (shown) => <p>{shown}</p>,
    text: (shown) => shown,
  });
  return (
    <>
      {editing.notice}
      <input
        aria-label="Words"
        value={value}
        readOnly={!editing.editable}
        onChange={(event) => setValue(event.target.value)}
      />
      {editing.compare}
    </>
  );
}

describe("useHeldDocument", () => {
  beforeEach(() => {
    hold.mockReset();
  });

  it("reads while someone else holds it, and takes the stored version on taking over", async () => {
    const user = userEvent.setup();
    hold.mockResolvedValueOnce(theirs).mockResolvedValueOnce(mine);
    const latest = vi.fn(() =>
      Promise.resolve({ value: "their words", version: 3 }),
    );
    render(<Page save={() => Promise.resolve()} latest={latest} />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Amira Hassan has been editing this since",
    );
    expect(screen.getByLabelText("Words")).toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: "Take over" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Take over" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Words")).toHaveValue("their words"),
    );
    expect(hold).toHaveBeenLastCalledWith({
      data: { hostType: "announcement", hostId: "host", take: true },
    });
    expect(screen.getByLabelText("Words")).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("compares a save refused as stale and keeps mine on top of the saved version", async () => {
    const user = userEvent.setup();
    hold.mockResolvedValue(mine);
    const save = vi
      .fn<PageProps["save"]>()
      .mockRejectedValueOnce(new Error("conflict.version"))
      .mockResolvedValue(undefined);
    const latest = vi.fn(() =>
      Promise.resolve({ value: "saved meanwhile", version: 5 }),
    );
    render(<Page save={save} latest={latest} />);
    await waitFor(() => expect(hold).toHaveBeenCalled());

    await user.clear(screen.getByLabelText("Words"));
    await user.type(screen.getByLabelText("Words"), "my words");

    const dialog = await screen.findByRole("dialog", {
      name: "Compare versions",
    });
    expect(
      await within(dialog).findByRole("region", { name: "Saved" }),
    ).toHaveTextContent("saved meanwhile");
    expect(
      within(dialog).getByRole("region", { name: "Yours, not saved" }),
    ).toHaveTextContent("my words");

    await user.click(within(dialog).getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith("my words", 5));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("turns read-only when taken, and offers the change it could not save", async () => {
    const user = userEvent.setup();
    hold.mockResolvedValueOnce(mine).mockResolvedValue(theirs);
    const save = vi
      .fn<PageProps["save"]>()
      .mockRejectedValue(new Error("documents.held"));
    render(
      <Page
        save={save}
        latest={() => Promise.resolve({ value: "first words", version: 2 })}
      />,
    );
    await waitFor(() => expect(hold).toHaveBeenCalledOnce());

    await user.type(screen.getByLabelText("Words"), " and more");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Amira Hassan took this over at",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your last change was not saved.",
    );
    expect(screen.getByLabelText("Words")).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", { name: "Copy my change" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compare versions" }));
    expect(
      await screen.findByRole("button", { name: "Take over and keep mine" }),
    ).toBeInTheDocument();
  });
});
