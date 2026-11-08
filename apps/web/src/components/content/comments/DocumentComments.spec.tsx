import type { EditorComments } from "@faridalms/editor";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCommentThreads, startCommentThread } from "~/server/comments";
import { render } from "~/testUtils";

import {
  CommentsPanel,
  CommentsToggle,
  DocumentCommentsProvider,
  useEditorComments,
} from "./DocumentComments";

vi.mock("~/server/comments", () => ({
  getCommentThreads: vi.fn(),
  startCommentThread: vi.fn(),
  replyToThread: vi.fn(),
  editComment: vi.fn(),
  removeComment: vi.fn(),
  resolveThread: vi.fn(),
  findColleagues: vi.fn(() => Promise.resolve([])),
}));

const HOST = {
  hostType: "lesson",
  hostId: "0190a3c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b",
  editor: "lesson-body",
};

const passage = (block: string) => ({
  start: { block, offset: 0 },
  end: { block, offset: 4 },
});

const thread = (
  id: string,
  quote: string,
  resolvedAt: string | null = null,
) => ({
  id,
  version: 1,
  part: "body",
  anchor: passage("p0x0zzzz"),
  quote,
  createdAt: "2026-11-07T08:00:00.000Z",
  resolvedAt,
  resolvedByNameEn: resolvedAt ? "Salama Ashoush" : null,
  resolvedByNameAr: null,
  comments: [
    {
      id: `${id}-1`,
      version: 1,
      authorId: "a",
      authorNameEn: "Salama Ashoush",
      authorNameAr: null,
      body: `About ${quote}`,
      mentionedUserIds: [],
      createdAt: "2026-11-07T08:00:00.000Z",
      editedAt: null,
      own: true,
    },
  ],
});

interface FakeEditorProps {
  id: string;
  found: string[];
  onReady?: (comments: EditorComments | undefined) => void;
}

/** Stands in for the editor: says which threads it found and starts one on asking. */
function FakeEditor({ id, found, onReady }: FakeEditorProps) {
  const comments = useEditorComments(id);
  const onPlaced = comments?.onPlaced;
  const marked = comments?.threads.length ?? 0;
  useEffect(() => {
    if (marked > 0) onPlaced?.(found);
  }, [onPlaced, marked, found]);
  useEffect(() => onReady?.(comments), [onReady, comments]);
  return null;
}

function renderPage(
  found: string[],
  onReady?: (comments: EditorComments | undefined) => void,
  editor = "lesson-body",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <DocumentCommentsProvider host={HOST}>
            <CommentsToggle />
            <FakeEditor id={editor} found={found} onReady={onReady} />
            <CommentsPanel />
          </DocumentCommentsProvider>
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

interface StoringPageProps {
  onMount: () => void;
}

function Writing({ onMount }: StoringPageProps) {
  useEffect(() => onMount(), [onMount]);
  return <p>Writing</p>;
}

/** A page whose record is stored partway through, as a new lesson's first autosave does. */
function StoringPage({ onMount }: StoringPageProps) {
  const [stored, setStored] = useState(false);
  return (
    <DocumentCommentsProvider host={stored ? HOST : undefined}>
      <button type="button" onClick={() => setStored(true)}>
        Store
      </button>
      <Writing onMount={onMount} />
      <CommentsToggle />
    </DocumentCommentsProvider>
  );
}

describe("comments on a document page", () => {
  beforeEach(() => {
    vi.mocked(getCommentThreads).mockResolvedValue([
      thread("gone", "lost words"),
      thread("here", "the Nile"),
      thread("done", "summer", "2026-11-07T09:00:00.000Z"),
    ]);
  });

  it("lists open threads first, says which lost their passage, and folds resolved ones away", async () => {
    const user = userEvent.setup();
    renderPage(["here", "done"]);
    await user.click(
      await screen.findByRole("button", { name: "2 open comments" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    const threads = within(panel).getAllByRole("article");
    expect(threads.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Comment on “the Nile”",
      "Comment on “lost words”",
      "Comment on “summer”",
    ]);
    await waitFor(() =>
      expect(
        within(threads[1] as HTMLElement).getByText("The passage was deleted"),
      ).toBeVisible(),
    );
    expect(
      within(threads[0] as HTMLElement).queryByText("The passage was deleted"),
    ).toBeNull();
    expect(within(panel).getByText("1 resolved comment")).toBeVisible();
  });

  it("starts a thread on the passage the editor gives, in the editor's part", async () => {
    const user = userEvent.setup();
    vi.mocked(startCommentThread).mockResolvedValue({ id: "new" });
    let comments: EditorComments | undefined;
    renderPage([], (given) => {
      comments = given;
    });
    await waitFor(() => expect(comments).toBeDefined());
    comments?.start(passage("p1x0zzzz"), "floods");
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    const box = within(panel).getByRole("textbox", { name: "Comment" });
    await user.type(box, "Which year?");
    await user.click(within(panel).getByRole("button", { name: "Comment" }));
    await waitFor(() =>
      expect(startCommentThread).toHaveBeenCalledWith({
        data: {
          hostType: "lesson",
          hostId: HOST.hostId,
          part: "body",
          anchor: passage("p1x0zzzz"),
          quote: "floods",
          body: "Which year?",
          mentions: [],
        },
      }),
    );
  });

  it("gives nothing to an editor the comments do not belong to", async () => {
    let comments: EditorComments | undefined = {} as EditorComments;
    renderPage(
      [],
      (given) => {
        comments = given;
      },
      "lesson-translation",
    );
    await waitFor(() => expect(comments).toBeUndefined());
  });

  it("keeps the page mounted when its record is first stored", async () => {
    const user = userEvent.setup();
    const mounted = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <QueryClientProvider client={queryClient}>
            <StoringPage onMount={mounted} />
          </QueryClientProvider>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await user.click(await screen.findByRole("button", { name: "Store" }));
    expect(
      await screen.findByRole("button", { name: "2 open comments" }),
    ).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledOnce();
  });
});
