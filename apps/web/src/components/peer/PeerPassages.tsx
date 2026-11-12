import type { ContentDocument } from "@faridalms/domain/content";
import type { CommentAnchor } from "@faridalms/domain/coursework";

import { anchorOf, wordsIn } from "@faridalms/editor/anchors";
import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { commentInPeerReview, removePeerComment } from "~/server/peer";
import { getMessageFromError } from "~/utils/error";

export interface PeerComment {
  id: string;
  anchor: CommentAnchor;
  words: string;
  body: string;
}

export interface PeerCommentListProps {
  comments: readonly PeerComment[];
  /** Lets the reviewer take one back while the reviews are not released. */
  onRemove?: (comment: PeerComment) => void;
}

/** A review's comments on passages of the work, each led by the words it is on. */
export function PeerCommentList({ comments, onRemove }: PeerCommentListProps) {
  if (comments.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h5 className="text-sm leading-5 font-medium">{m.peerPassages()}</h5>
      <ol className="grid gap-2">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
          >
            <div className="grid min-w-0 gap-0.5 text-sm leading-5">
              {comment.words ? (
                <q
                  dir="auto"
                  className="text-[13px] leading-[18px] text-muted-foreground"
                >
                  {comment.words}
                </q>
              ) : null}
              <p dir="auto" className="whitespace-pre-wrap">
                {comment.body}
              </p>
            </div>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.peerPassageRemove()}
                onClick={() => onRemove(comment)}
              >
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface PeerPassagesProps {
  reviewId: string;
  document: ContentDocument;
  comments: readonly PeerComment[];
  /** Whether the reviewer may still comment, before the reviews are released. */
  editable: boolean;
}

/**
 * A classmate's page as its reviewer reads it, the passages commented on
 * marked. Selecting words offers a comment on them, kept with the review
 * and read by the author with it.
 */
export function PeerPassages({
  reviewId,
  document: work,
  comments,
  editable,
}: PeerPassagesProps) {
  const queryClient = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const [picked, setPicked] = useState<{
    anchor: CommentAnchor;
    words: string;
  } | null>(null);
  const [body, setBody] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["peer"] });
  const save = useMutation({
    mutationFn: (input: { anchor: CommentAnchor; body: string }) =>
      commentInPeerReview({ data: { reviewId, ...input } }),
    onSuccess: async () => {
      setPicked(null);
      setBody("");
      await refresh();
    },
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removePeerComment({ data: { id } }),
    onSuccess: refresh,
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });

  // The page is read, not operated: a selection in it is what is commented on.
  useEffect(() => {
    const element = root.current;
    if (!element || !editable) return undefined;
    const pick = () => {
      const selection = element.ownerDocument.getSelection();
      if (!selection || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!element.contains(range.commonAncestorContainer)) return;
      const anchor = anchorOf(element, range);
      if (anchor) setPicked({ anchor, words: wordsIn(element, range) });
    };
    element.addEventListener("pointerup", pick);
    element.addEventListener("keyup", pick);
    return () => {
      element.removeEventListener("pointerup", pick);
      element.removeEventListener("keyup", pick);
    };
  }, [editable]);

  return (
    <div className="grid gap-3">
      <div ref={root}>
        <ContentView
          document={work}
          fileUrl={(id) => `/files/${id}`}
          marks={[
            ...comments.map((comment) => ({
              id: comment.id,
              ...comment.anchor,
            })),
            ...(picked ? [{ id: "draft", ...picked.anchor, draft: true }] : []),
          ]}
        />
      </div>
      {editable && !picked ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.peerPassageHint()}
        </p>
      ) : null}
      {picked ? (
        <form
          className="grid gap-2 rounded-lg border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim())
              save.mutate({ anchor: picked.anchor, body: body.trim() });
          }}
        >
          <label htmlFor={fieldId} className="grid gap-1 text-sm leading-5">
            <span className="font-medium">{m.peerPassageOn()}</span>
            <q
              dir="auto"
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {picked.words}
            </q>
          </label>
          <Textarea
            id={fieldId}
            dir="auto"
            rows={2}
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              className="max-md:h-10"
              disabled={!body.trim() || save.isPending}
            >
              <MessageSquarePlus aria-hidden />
              {m.peerPassageSave()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => {
                setPicked(null);
                setBody("");
              }}
            >
              {m.commonCancel()}
            </Button>
          </div>
        </form>
      ) : null}
      <PeerCommentList
        comments={comments}
        {...(editable
          ? { onRemove: (comment) => remove.mutate(comment.id) }
          : {})}
      />
    </div>
  );
}
