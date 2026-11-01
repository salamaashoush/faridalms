import type { ContentDocument } from "@faridalms/domain/content";
import type { ReactNode } from "react";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { Button } from "@faridalms/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  MessageSquareReply,
  Pencil,
  Plus,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { ActionMenu } from "~/components/system/ActionMenu";
import { RecordEmpty, RecordSection } from "~/components/system/RecordPage";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { discussionQuery } from "~/queries/coursework";
import {
  editDiscussionPost,
  hideDiscussionPost,
  postInDiscussion,
} from "~/server/coursework";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName } from "../people/format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof discussionQuery>["queryFn"]>>
>;
type Post = Data["posts"][number];

const nameOf = (post: Pick<Post, "authorNameEn" | "authorNameAr">) =>
  displayName({ fullNameEn: post.authorNameEn, fullNameAr: post.authorNameAr });

const written = (content: ContentDocument) =>
  contentPlainText(content).trim().length > 0;

/** Writes a post, a reply under one, or a change to the writer's own. */
function PostEditor({
  assignmentId,
  label,
  initial,
  submitLabel,
  onSend,
  onDone,
  onCancel,
}: {
  assignmentId: string;
  label: string;
  initial?: ContentDocument;
  submitLabel: string;
  onSend: (content: ContentDocument) => Promise<unknown>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const media = useDocumentMedia({ type: "work", id: assignmentId });
  const [content, setContent] = useState(initial ?? emptyContent());
  const [uploading, setUploading] = useState(false);
  const send = useMutation({
    mutationFn: () => onSend(content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      onDone();
    },
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const id = useId();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (written(content) && !send.isPending) send.mutate();
      }}
    >
      <ContentEditor
        id={id}
        label={label}
        placeholder={m.discussionWritePost()}
        value={content}
        onChange={setContent}
        onUploadingChange={setUploading}
        media={media}
        initialFocus={Boolean(onCancel)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="max-md:h-10"
          disabled={!written(content) || uploading || send.isPending}
        >
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={onCancel}
          >
            {m.commonCancel()}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PostItem({
  post,
  data,
  assignmentId,
}: {
  post: Post;
  data: Data;
  assignmentId: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const name = nameOf(post);
  const actions: ActionItem[] = [];
  if (post.mine && post.content && !post.hidden && !data.closed)
    actions.push({
      label: m.courseworkEdit(),
      icon: Pencil,
      onSelect: () => setEditing(true),
    });
  if (data.moderates && !post.removed)
    actions.push({
      label: post.hidden ? m.discussionShow() : m.discussionHide(),
      icon: post.hidden ? Eye : EyeOff,
      onSelect: async () => {
        await hideDiscussionPost({
          data: { id: post.id, hidden: !post.hidden },
        });
        await queryClient.invalidateQueries({ queryKey: ["coursework"] });
        toast.success(
          post.hidden ? m.discussionShown() : m.discussionHiddenDone(),
        );
      },
    });
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      <PersonAvatar name={name} size="sm" />
      <div className="grid min-w-0 gap-1">
        <header className="flex min-h-6 items-start justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm leading-5">
            <bdi className="font-medium">{name}</bdi>
            {post.teacher || post.mine ? (
              <span className="rounded bg-muted px-1.5 text-xs leading-5 text-muted-foreground">
                {post.teacher ? m.discussionTeacher() : m.discussionYou()}
              </span>
            ) : null}
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {[
                formatInstant(post.createdAt),
                post.editedAt ? m.discussionEdited() : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
          <ActionMenu
            label={m.discussionActions()}
            actions={actions}
            className="-mt-1 max-md:size-10"
          />
        </header>
        {editing && post.content ? (
          <PostEditor
            assignmentId={assignmentId}
            label={m.courseworkEdit()}
            initial={post.content}
            submitLabel={m.commonSave()}
            onSend={(content) =>
              editDiscussionPost({ data: { id: post.id, content } }).then(() =>
                toast.success(m.discussionSaved()),
              )
            }
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : post.content ? (
          <ContentView
            document={post.content}
            fileUrl={(id) => `/files/${id}`}
          />
        ) : (
          <p className="text-sm leading-5 text-muted-foreground italic">
            {post.removed ? m.discussionRemoved() : m.discussionHidden()}
          </p>
        )}
        {post.hidden && post.content ? (
          <p className="text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
            {post.mine ? m.discussionHiddenMine() : m.discussionHidden()}
          </p>
        ) : null}
      </div>
    </article>
  );
}

interface Standing {
  posted: number;
  replied: number;
  replies: number;
}

/** How far a student has met what the discussion asks: an answer, then replies. */
function Progress({
  standing,
  pending,
}: {
  standing: Standing;
  /** What the first line says until an answer is posted. */
  pending: string;
}) {
  const items = [
    {
      key: "answer",
      done: standing.posted > 0,
      label: standing.posted > 0 ? m.discussionAnswered() : pending,
    },
    ...(standing.replies > 0
      ? [
          {
            key: "replies",
            done: standing.replied >= standing.replies,
            label: m.discussionRepliesDone({
              done: formatNumber(Math.min(standing.replied, standing.replies)),
              needed: formatNumber(standing.replies),
            }),
          },
        ]
      : []),
  ];
  return (
    <ul className="grid gap-1.5 text-sm leading-5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          {item.done ? (
            <CheckCircle2 aria-hidden className="size-4 text-success" />
          ) : (
            <Circle aria-hidden className="size-4 text-muted-foreground" />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

type MarkedPost = Post & {
  answers: {
    authorNameEn: string | null;
    authorNameAr: string | null;
    excerpt: string;
  } | null;
};

/**
 * One student's posts as their teacher marks them: each in the order
 * written, a reply led by the words it answers.
 */
export function DiscussionPosts({
  standing,
  posts,
}: {
  standing: Standing;
  posts: MarkedPost[];
}) {
  return (
    <section aria-labelledby="discussion-posts" className="grid gap-4">
      <h2 id="discussion-posts" className="text-base leading-6 font-semibold">
        {m.discussionPostsOf()}
      </h2>
      <Progress standing={standing} pending={m.discussionNoPosts()} />
      {posts.length ? (
        <ol className="grid divide-y">
          {posts.map((post) => (
            <li key={post.id} className="grid gap-2 py-4 first:pt-0 last:pb-0">
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {[
                  formatInstant(post.createdAt),
                  post.editedAt ? m.discussionEdited() : null,
                  post.hidden ? m.discussionHidden() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {post.answers ? (
                <blockquote className="grid gap-0.5 border-s-2 ps-3 text-[13px] leading-[18px] text-muted-foreground">
                  <span className="font-medium">
                    {m.discussionReplyingTo({ name: nameOf(post.answers) })}
                  </span>
                  <span dir="auto">{post.answers.excerpt}</span>
                </blockquote>
              ) : null}
              {post.content ? (
                <ContentView
                  document={post.content}
                  fileUrl={(id) => `/files/${id}`}
                />
              ) : (
                <p className="text-sm leading-5 text-muted-foreground italic">
                  {m.discussionRemoved()}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/**
 * A discussion set as coursework, read the same way by its students and
 * its teachers: posts in the order written, each with its replies beneath.
 * A student answers first, then replies; a teacher posts, and hides a post
 * from the class without taking it from its author.
 */
export function Discussion({
  assignmentId,
  tab = false,
}: {
  assignmentId: string;
  /** Shown as a record's tab, which names it already. */
  tab?: boolean;
}) {
  const query = useQuery(discussionQuery(assignmentId));
  const [composing, setComposing] = useState({ key: 0, open: false });
  const [replying, setReplying] = useState<string | null>(null);
  const data = query.data;
  const frame = (hint: string, children: ReactNode) =>
    tab ? (
      <div className="grid gap-6">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
        {children}
      </div>
    ) : (
      <RecordSection
        variant="page"
        title={m.discussionSection()}
        description={hint}
      >
        {children}
      </RecordSection>
    );
  if (!data)
    return frame(
      m.discussionStudentHint(),
      <div aria-busy="true" className="min-h-40" />,
    );
  const threads = data.posts.filter((post) => post.parentId === null);
  const repliesTo = Map.groupBy(
    data.posts.filter((post) => post.parentId !== null),
    (post) => post.parentId,
  );
  const answering = !data.moderates && data.posted === 0;
  const open = !data.closed && (answering || composing.open);
  const send = (parentId: string) => (content: ContentDocument) =>
    postInDiscussion({ data: { assignmentId, parentId, content } }).then(() =>
      toast.success(m.discussionPosted()),
    );
  return frame(
    data.moderates ? m.discussionTeacherHint() : m.discussionStudentHint(),
    <div className="grid gap-6">
      {data.moderates ? null : (
        <Progress standing={data} pending={m.discussionYourAnswer()} />
      )}
      {data.closed || data.waiting ? (
        <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm leading-5">
          {data.closed ? m.discussionClosed() : m.discussionWaiting()}
        </p>
      ) : null}
      {open ? (
        <PostEditor
          key={composing.key}
          assignmentId={assignmentId}
          label={answering ? m.discussionYourAnswer() : m.discussionNewPost()}
          submitLabel={m.discussionPost()}
          onSend={send("")}
          onDone={() =>
            setComposing((current) => ({ key: current.key + 1, open: false }))
          }
          onCancel={
            answering
              ? undefined
              : () =>
                  setComposing((current) => ({
                    key: current.key + 1,
                    open: false,
                  }))
          }
        />
      ) : data.closed ? null : (
        <div>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() =>
              setComposing((current) => ({ ...current, open: true }))
            }
          >
            <Plus aria-hidden />
            {m.discussionNewPost()}
          </Button>
        </div>
      )}
      {threads.length ? (
        <ol className="grid gap-6">
          {threads.map((thread) => {
            const replies = repliesTo.get(thread.id) ?? [];
            const canReply =
              !data.closed && !data.waiting && thread.content !== null;
            return (
              <li key={thread.id} className="grid gap-3">
                <PostItem
                  post={thread}
                  data={data}
                  assignmentId={assignmentId}
                />
                {replies.length ? (
                  <ol className="ms-3 grid gap-3 border-s ps-6">
                    {replies.map((reply) => (
                      <li key={reply.id}>
                        <PostItem
                          post={reply}
                          data={data}
                          assignmentId={assignmentId}
                        />
                      </li>
                    ))}
                  </ol>
                ) : null}
                {replying === thread.id ? (
                  <div className="ms-9">
                    <PostEditor
                      assignmentId={assignmentId}
                      label={m.discussionReplyTo({ name: nameOf(thread) })}
                      submitLabel={m.courseworkReplySend()}
                      onSend={send(thread.id)}
                      onDone={() => setReplying(null)}
                      onCancel={() => setReplying(null)}
                    />
                  </div>
                ) : canReply ? (
                  <div className="ms-9">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ms-2 max-md:h-10"
                      aria-label={m.discussionReplyTo({
                        name: nameOf(thread),
                      })}
                      onClick={() => setReplying(thread.id)}
                    >
                      <MessageSquareReply
                        aria-hidden
                        className="rtl:-scale-x-100"
                      />
                      {m.courseworkReply()}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <RecordEmpty>{m.discussionEmpty()}</RecordEmpty>
      )}
    </div>,
  );
}
