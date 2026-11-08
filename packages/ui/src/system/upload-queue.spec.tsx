import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { UploadQueueItem } from "./upload-queue";

import { renderWithSystem } from "./testing";
import { FileDropZone, UploadQueue } from "./upload-queue";

const items: UploadQueueItem[] = [
  {
    id: "a",
    name: "Sports day.jpg",
    fact: "Picture · 2 MB",
    progress: 0.42,
    state: "sending",
  },
  {
    id: "b",
    name: "Timetable.pdf",
    progress: 0,
    state: "failed",
    error: "The connection dropped.",
    retryable: true,
  },
  {
    id: "c",
    name: "Virus.exe",
    progress: 0,
    state: "failed",
    error: "This kind of file cannot be kept.",
    retryable: false,
  },
];

describe("an upload queue", () => {
  it("shows each file's progress, why one failed, and a way to stop or retry", async () => {
    const onCancel = vi.fn<(id: string) => void>();
    const onRetry = vi.fn<(id: string) => void>();
    const onDismiss = vi.fn<(id: string) => void>();
    renderWithSystem(
      <UploadQueue
        label="Uploading"
        items={items}
        onCancel={onCancel}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("list", { name: "Uploading" })).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "Uploading Sports day.jpg, 42%" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(
      ["The connection dropped.", "This kind of file cannot be kept."],
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Stop uploading Sports day.jpg" }),
    );
    expect(onCancel).toHaveBeenCalledWith("a");
    // Only the file a second try could help offers one.
    const retries = screen.getAllByRole("button", { name: /Try again/ });
    expect(retries).toHaveLength(1);
    await userEvent.click(retries[0] as HTMLElement);
    expect(onRetry).toHaveBeenCalledWith("b");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Virus.exe from the list" }),
    );
    expect(onDismiss).toHaveBeenCalledWith("c");
  });

  it("shows nothing when nothing is on its way", () => {
    const { container } = renderWithSystem(
      <UploadQueue
        label="Uploading"
        items={[]}
        onCancel={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(container.querySelector("ul")).toBeNull();
  });
});

const file = new File(["hello"], "notes.txt", { type: "text/plain" });

/** A drag or clipboard carrying files, as a browser builds one. */
function carrying(files: File[]) {
  return {
    files,
    types: ["Files"],
    dropEffect: "none",
    getData: () => "",
  };
}

describe("a file drop zone", () => {
  it("says what a drop does while files are over it, and takes them", () => {
    const onFiles = vi.fn<(files: File[]) => void>();
    renderWithSystem(
      <FileDropZone onFiles={onFiles} label="Drop to add to Sports day">
        <p>Library</p>
      </FileDropZone>,
    );
    const zone = screen.getByText("Library").parentElement as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: carrying([file]) });
    expect(screen.getByText("Drop to add to Sports day")).toBeTruthy();
    fireEvent.drop(zone, { dataTransfer: carrying([file]) });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(screen.queryByText("Drop to add to Sports day")).toBeNull();
  });

  it("takes files pasted on the page, but leaves a paste into a field to the field", () => {
    const onFiles = vi.fn<(files: File[]) => void>();
    renderWithSystem(
      <FileDropZone onFiles={onFiles} pastePage>
        <input aria-label="Search" />
      </FileDropZone>,
    );
    fireEvent.paste(screen.getByRole("textbox", { name: "Search" }), {
      clipboardData: carrying([file]),
    });
    expect(onFiles).not.toHaveBeenCalled();
    fireEvent.paste(document.body, { clipboardData: carrying([file]) });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("refuses everything while disabled", () => {
    const onFiles = vi.fn<(files: File[]) => void>();
    renderWithSystem(
      <FileDropZone onFiles={onFiles} disabled>
        <p>Picture</p>
      </FileDropZone>,
    );
    const zone = screen.getByText("Picture").parentElement as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: carrying([file]) });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
