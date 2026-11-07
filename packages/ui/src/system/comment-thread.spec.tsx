import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CommentDraft, MentionCandidate } from "./comment-thread";

import { CommentComposer, CommentThread, EMPTY_DRAFT } from "./comment-thread";
import { renderWithSystem } from "./testing";

const LABELS = {
  thread: "Comment on “the Nile”",
  jump: "Go to the passage",
  resolve: "Resolve",
  reopen: "Reopen",
  detached: "The passage was deleted",
  edited: "edited",
  actions: (author: string) => `Comment by ${author}`,
};

const comment = {
  id: "1",
  author: "Salama Ashoush",
  when: "Nov 7, 4:00 PM",
  at: "2026-11-07T14:00:00Z",
  body: "Which edition?",
};

const COMPOSER = {
  field: "Reply",
  placeholder: "Reply, or @ to mention",
  submit: "Send",
  cancel: "Cancel",
  people: "Colleagues",
};

describe("CommentThread", () => {
  it("shows the passage, each comment with its author and time, and goes to the passage", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    renderWithSystem(
      <CommentThread
        quote="the Nile"
        status="open"
        labels={LABELS}
        comments={[comment, { ...comment, id: "2", body: "The second.", edited: true }]}
        onJump={onJump}
        onToggleResolved={vi.fn()}
      />,
    );
    const thread = screen.getByRole("article", { name: "Comment on “the Nile”" });
    expect(within(thread).getByText("Which edition?")).toBeVisible();
    expect(within(thread).getAllByText("Nov 7, 4:00 PM")[0]).toHaveAttribute(
      "datetime",
      "2026-11-07T14:00:00Z",
    );
    expect(within(thread).getByText("· edited")).toBeVisible();
    await user.click(within(thread).getByRole("button", { name: /Go to the passage/ }));
    expect(onJump).toHaveBeenCalledOnce();
  });

  it("says a passage was deleted and keeps its words, with nowhere to go", () => {
    renderWithSystem(
      <CommentThread
        quote="the Nile"
        status="open"
        detached
        labels={LABELS}
        comments={[comment]}
        onJump={vi.fn()}
        onToggleResolved={vi.fn()}
      />,
    );
    expect(screen.getByText("The passage was deleted")).toBeVisible();
    expect(screen.getByText("the Nile")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Go to the passage/ })).toBeNull();
  });

  it("resolves an open thread and reopens a resolved one", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = renderWithSystem(
      <CommentThread
        quote="the Nile"
        status="open"
        labels={LABELS}
        comments={[comment]}
        onToggleResolved={onToggle}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <CommentThread
        quote="the Nile"
        status="resolved"
        labels={{ ...LABELS, resolved: "Resolved by Salama Ashoush" }}
        comments={[comment]}
        onToggleResolved={onToggle}
      />,
    );
    expect(screen.getByText("Resolved by Salama Ashoush")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeVisible();
  });

  it("offers a comment's own actions from its menu", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithSystem(
      <CommentThread
        quote=""
        status="open"
        labels={LABELS}
        comments={[{ ...comment, actions: [{ label: "Edit", onSelect: onEdit }] }]}
        onToggleResolved={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Comment by Salama Ashoush" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

interface ComposerProps {
  onSubmit: (draft: CommentDraft) => void;
  findPeople: (query: string) => Promise<MentionCandidate[]>;
}

function Composer({ onSubmit, findPeople }: ComposerProps) {
  const [draft, setDraft] = useState<CommentDraft>(EMPTY_DRAFT);
  return (
    <CommentComposer
      value={draft}
      onChange={setDraft}
      onSubmit={() => onSubmit(draft)}
      labels={COMPOSER}
      findPeople={findPeople}
    />
  );
}

describe("CommentComposer", () => {
  it("offers colleagues after an @ and remembers the one picked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const findPeople = vi.fn((query: string) =>
      Promise.resolve(
        [
          { id: "a", label: "Salama Ashoush", detail: "Teacher" },
          { id: "b", label: "Acme Head", detail: "Principal" },
        ].filter((person) =>
          person.label.toLowerCase().startsWith(query.toLowerCase()),
        ),
      ),
    );
    renderWithSystem(<Composer onSubmit={onSubmit} findPeople={findPeople} />);
    const field = screen.getByRole("textbox", { name: "Reply" });
    await user.type(field, "Thanks @sal");
    const list = await screen.findByRole("listbox", { name: "Colleagues" });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(findPeople).toHaveBeenLastCalledWith("sal");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(field).toHaveValue("Thanks @Salama Ashoush "),
    );
    await user.type(field, "please check");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledWith({
      text: "Thanks @Salama Ashoush please check",
      mentions: [{ id: "a", label: "Salama Ashoush", detail: "Teacher" }],
    });
  });

  it("sends with Ctrl and Enter, and not while empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithSystem(
      <Composer onSubmit={onSubmit} findPeople={() => Promise.resolve([])} />,
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Reply" }), "Done");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledWith({ text: "Done", mentions: [] });
  });
});
