import type { Rubric } from "@faridalms/domain/coursework";

import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { FormField, SelectField } from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Send, Users } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import { displayName } from "~/components/people/format";
import { FileList } from "~/components/system/FileList";
import * as m from "~/i18n/messages";
import { myPeerReviewsQuery, peerOverviewQuery } from "~/queries/coursework";
import {
  hidePeerReview,
  releasePeerReviews,
  sendPeerReview,
  startPeerReview,
} from "~/server/coursework";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

interface Written {
  rubricScores: Record<string, string>;
  strengths: string;
  suggestion: string;
}

interface ReviewTextProps {
  rubric: Rubric | null;
  review: Written;
}

/** What a review said: the rubric's levels, then the two prompts. */
function ReviewText({ rubric, review }: ReviewTextProps) {
  return (
    <div className="grid gap-3">
      {rubric ? (
        <dl className="grid gap-1 text-sm leading-5">
          {rubric.criteria.map((criterion) => (
            <div
              key={criterion.id}
              className="flex flex-wrap justify-between gap-x-4"
            >
              <dt dir="auto">{criterion.title}</dt>
              <dd dir="auto" className="text-muted-foreground">
                {criterion.levels.find(
                  (level) => level.id === review.rubricScores[criterion.id],
                )?.title ?? m.commonNotRecorded()}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="grid gap-2 text-sm leading-5">
        <div className="grid gap-0.5">
          <dt className="font-medium">{m.peerStrengths()}</dt>
          <dd dir="auto" className="whitespace-pre-wrap">
            {review.strengths}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="font-medium">{m.peerSuggestion()}</dt>
          <dd dir="auto" className="whitespace-pre-wrap">
            {review.suggestion}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export interface PeerReviewPanelProps {
  assignmentId: string;
}

/**
 * Peer review as an assignment's teacher runs it: hand the reviews out
 * among the work handed in, bring later work in, read every review and
 * hide one, then release them to the authors.
 */
export function PeerReviewPanel({ assignmentId }: PeerReviewPanelProps) {
  const queryClient = useQueryClient();
  const data = useQuery(peerOverviewQuery(assignmentId)).data;
  const start = useServerFn(startPeerReview);
  const release = useServerFn(releasePeerReviews);
  const hide = useServerFn(hidePeerReview);
  const [confirming, setConfirming] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["coursework"] });
  const starting = useMutation({
    mutationFn: () => start({ data: { assignmentId } }),
    onSuccess: refresh,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const releasing = useMutation({
    mutationFn: () => release({ data: { assignmentId } }),
    onSuccess: async () => {
      setConfirming(false);
      await refresh();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const hiding = useMutation({
    mutationFn: (input: { reviewId: string; hidden: boolean }) =>
      hide({ data: input }),
    onSuccess: refresh,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  if (!data) return <div aria-busy="true" className="min-h-40" />;
  const names = new Map(
    data.students.map((student) => [student.id, displayName(student)]),
  );
  const how = data.anonymous
    ? m.peerHowAnonymous({ count: data.reviews ?? 1 })
    : m.peerHowNamed({ count: data.reviews ?? 1 });
  if (!data.startedAt)
    return (
      <EmptyState
        icon={Users}
        title={m.peerNotStarted()}
        description={`${how} ${m.peerHandedIn({ count: formatNumber(data.handedIn) })}`}
        action={
          <Button
            type="button"
            disabled={starting.isPending || data.handedIn < 2}
            onClick={() => starting.mutate()}
          >
            {m.peerStart()}
          </Button>
        }
      />
    );
  const sent = data.given.filter((review) => review.sentAt !== null).length;
  const authors = Map.groupBy(data.given, (review) => review.authorId);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 flex-1 basis-72 gap-1">
          <p className="text-sm leading-5 font-medium">
            {data.releasedAt
              ? m.peerReleasedOn({
                  date: formatInstant(data.releasedAt),
                })
              : m.peerSentOf({
                  count: formatNumber(sent),
                  total: formatNumber(data.given.length),
                })}
          </p>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {data.releasedAt ? m.peerReleasedHint() : m.peerReleaseHint()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.waiting > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={starting.isPending}
              onClick={() => starting.mutate()}
            >
              {m.peerBringIn({ count: formatNumber(data.waiting) })}
            </Button>
          ) : null}
          {data.releasedAt ? null : (
            <Button
              type="button"
              className="max-md:h-10"
              onClick={() => setConfirming(true)}
            >
              <Send aria-hidden />
              {m.peerRelease()}
            </Button>
          )}
        </div>
      </div>
      <ul className="grid gap-4">
        {[...authors].map(([authorId, reviews]) => (
          <li key={authorId}>
            <RecordSection
              title={m.peerReviewsOf({ name: names.get(authorId) ?? "" })}
            >
              <RecordList>
                {reviews.map((review) => (
                  <li key={review.id} className="grid gap-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm leading-5 font-medium">
                          <bdi>{names.get(review.reviewerId) ?? ""}</bdi>
                        </span>
                        {review.sentAt ? (
                          <span className="text-[13px] leading-[18px] text-muted-foreground">
                            {formatInstant(review.sentAt)}
                          </span>
                        ) : (
                          <StatusBadge tone="warning">
                            {m.peerWaiting()}
                          </StatusBadge>
                        )}
                        {review.hidden ? (
                          <StatusBadge tone="neutral">
                            {m.peerHidden()}
                          </StatusBadge>
                        ) : null}
                      </div>
                      {review.sentAt ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="max-md:h-10"
                          disabled={hiding.isPending}
                          onClick={() =>
                            hiding.mutate({
                              reviewId: review.id,
                              hidden: !review.hidden,
                            })
                          }
                        >
                          {review.hidden ? (
                            <Eye aria-hidden />
                          ) : (
                            <EyeOff aria-hidden />
                          )}
                          {review.hidden ? m.peerShow() : m.peerHide()}
                        </Button>
                      ) : null}
                    </div>
                    {review.sentAt ? (
                      <ReviewText rubric={data.rubric} review={review} />
                    ) : null}
                  </li>
                ))}
              </RecordList>
            </RecordSection>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirming}
        title={m.peerReleaseTitle()}
        body={m.peerReleaseBody({
          count: formatNumber(data.given.length - sent),
        })}
        confirmLabel={m.peerRelease()}
        pending={releasing.isPending}
        onConfirm={() => releasing.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

export interface StudentPeerReviewsProps {
  assignmentId: string;
  studentId: string;
}

/**
 * A student's part in peer review, for their teacher marking them: the
 * reviews of their work and those they wrote, with names, as the teacher
 * reads every review.
 */
export function StudentPeerReviews({
  assignmentId,
  studentId,
}: StudentPeerReviewsProps) {
  const data = useQuery(peerOverviewQuery(assignmentId)).data;
  if (!data?.startedAt) return null;
  const names = new Map(
    data.students.map((student) => [student.id, displayName(student)]),
  );
  const parts = [
    {
      title: m.peerOfTheirWork(),
      reviews: data.given.filter((review) => review.authorId === studentId),
      who: (review: (typeof data.given)[number]) =>
        names.get(review.reviewerId) ?? "",
    },
    {
      title: m.peerTheyWrote(),
      reviews: data.given.filter((review) => review.reviewerId === studentId),
      who: (review: (typeof data.given)[number]) =>
        m.peerOnWorkOf({ name: names.get(review.authorId) ?? "" }),
    },
  ];
  return (
    <>
      {parts.map((part) => (
        <RecordSection key={part.title} title={part.title}>
          {part.reviews.length === 0 ? (
            <RecordEmpty>{m.peerNoneYet()}</RecordEmpty>
          ) : (
            <RecordList>
              {part.reviews.map((review) => (
                <li key={review.id} className="grid gap-3 py-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm leading-5 font-medium">
                      <bdi>{part.who(review)}</bdi>
                    </span>
                    {review.sentAt ? (
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {formatInstant(review.sentAt)}
                      </span>
                    ) : (
                      <StatusBadge tone="warning">
                        {m.peerWaiting()}
                      </StatusBadge>
                    )}
                    {review.hidden ? (
                      <StatusBadge tone="neutral">{m.peerHidden()}</StatusBadge>
                    ) : null}
                  </div>
                  {review.sentAt ? (
                    <ReviewText rubric={data.rubric} review={review} />
                  ) : null}
                </li>
              ))}
            </RecordList>
          )}
        </RecordSection>
      ))}
    </>
  );
}

type Mine = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myPeerReviewsQuery>["queryFn"]>>
>;
type ToGive = Mine["toGive"][number];

interface ReviewFormProps {
  assignmentId: string;
  rubric: Rubric | null;
  review: ToGive;
  onSent: () => void;
}

function ReviewForm({ assignmentId, rubric, review, onSent }: ReviewFormProps) {
  const queryClient = useQueryClient();
  const send = useServerFn(sendPeerReview);
  const [levels, setLevels] = useState<Record<string, string>>(
    review.rubricScores,
  );
  const [strengths, setStrengths] = useState(review.strengths);
  const [suggestion, setSuggestion] = useState(review.suggestion);
  const ready =
    strengths.trim() !== "" &&
    suggestion.trim() !== "" &&
    (rubric?.criteria.every((criterion) => levels[criterion.id]) ?? true);
  const sending = useMutation({
    mutationFn: () =>
      send({
        data: {
          reviewId: review.id,
          rubricScores: rubric ? levels : {},
          strengths: strengths.trim(),
          suggestion: suggestion.trim(),
        },
      }),
    onSuccess: async () => {
      toast.success(m.peerSent());
      await queryClient.invalidateQueries({
        queryKey: myPeerReviewsQuery(assignmentId).queryKey,
      });
      onSent();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <form
      className="grid gap-4 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) sending.mutate();
      }}
    >
      {rubric?.criteria.map((criterion) => (
        <SelectField
          key={criterion.id}
          id={`peer-${review.id}-${criterion.id}`}
          label={criterion.title}
          hint={
            criterion.levels.find((level) => level.id === levels[criterion.id])
              ?.description || undefined
          }
          value={levels[criterion.id] ?? "none"}
          options={[
            { value: "none", label: m.peerChooseLevel() },
            ...criterion.levels.map((level) => ({
              value: level.id,
              label: level.title,
            })),
          ]}
          onChange={(value) => {
            const next = { ...levels };
            if (value === "none") delete next[criterion.id];
            else next[criterion.id] = value;
            setLevels(next);
          }}
        />
      ))}
      <FormField
        id={`peer-${review.id}-strengths`}
        label={m.peerStrengths()}
        hint={m.peerStrengthsHint()}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={2000}
            value={strengths}
            onChange={(event) => setStrengths(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`peer-${review.id}-suggestion`}
        label={m.peerSuggestion()}
        hint={m.peerSuggestionHint()}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={2000}
            value={suggestion}
            onChange={(event) => setSuggestion(event.target.value)}
          />
        )}
      </FormField>
      <div>
        <Button
          type="submit"
          className="max-md:h-10"
          disabled={!ready || sending.isPending}
        >
          <Send aria-hidden />
          {review.sentAt ? m.peerSendAgain() : m.peerSend()}
        </Button>
      </div>
    </form>
  );
}

interface GiveItemProps {
  assignmentId: string;
  data: Mine;
  review: ToGive;
}

function GiveItem({ assignmentId, data, review }: GiveItemProps) {
  const [open, setOpen] = useState(!review.sentAt);
  const headingId = useId();
  const title = review.author
    ? displayName(review.author)
    : m.peerWorkNumber({ number: formatNumber(review.number) });
  return (
    <li className="grid gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h4 id={headingId} className="text-sm leading-5 font-semibold">
            <bdi>{title}</bdi>
          </h4>
          {review.sentAt ? (
            <StatusBadge tone="success">{m.peerReviewSent()}</StatusBadge>
          ) : (
            <StatusBadge tone="warning">{m.peerToReview()}</StatusBadge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          aria-expanded={open}
          aria-describedby={headingId}
          onClick={() => setOpen(!open)}
        >
          {open ? m.peerClose() : m.peerOpen()}
        </Button>
      </div>
      {open ? (
        <>
          <div className="grid gap-3 rounded-lg border p-4">
            {review.content ? (
              <ContentView
                document={review.content}
                fileUrl={(id) => `/files/${id}`}
              />
            ) : null}
            <FileList files={review.files} />
          </div>
          {data.released ? (
            review.sentAt ? (
              <ReviewText rubric={data.rubric} review={review} />
            ) : (
              <RecordEmpty>{m.peerClosed()}</RecordEmpty>
            )
          ) : (
            <ReviewForm
              assignmentId={assignmentId}
              rubric={data.rubric}
              review={review}
              onSent={() => setOpen(false)}
            />
          )}
        </>
      ) : null}
    </li>
  );
}

export interface PeerReviewWorkProps {
  assignmentId: string;
}

/**
 * Peer review on a student's own page: the classmates' work they review,
 * and, once their teacher releases them, the reviews of their own.
 */
export function PeerReviewWork({ assignmentId }: PeerReviewWorkProps) {
  const data = useQuery(myPeerReviewsQuery(assignmentId)).data;
  if (!data) return null;
  const how = data.anonymous
    ? m.peerHowAnonymous({ count: data.reviews ?? 1 })
    : m.peerHowNamed({ count: data.reviews ?? 1 });
  return (
    <>
      <RecordSection variant="page" title={m.peerSection()} description={how}>
        {data.toGive.length === 0 ? (
          <RecordEmpty>
            {data.started ? m.peerNoneForYou() : m.peerNotYet()}
          </RecordEmpty>
        ) : (
          <RecordList>
            {data.toGive.map((review) => (
              <GiveItem
                key={review.id}
                assignmentId={assignmentId}
                data={data}
                review={review}
              />
            ))}
          </RecordList>
        )}
      </RecordSection>
      {data.released ? (
        <RecordSection variant="page" title={m.peerReceived()}>
          {data.received.length === 0 ? (
            <RecordEmpty>{m.peerNoneReceived()}</RecordEmpty>
          ) : (
            <RecordList>
              {data.received.map((review) => (
                <li key={review.id} className="grid gap-3 py-4">
                  <h4 className="text-sm leading-5 font-semibold">
                    <bdi>
                      {review.reviewer
                        ? displayName(review.reviewer)
                        : m.peerClassmateNumber({
                            number: formatNumber(review.number),
                          })}
                    </bdi>
                  </h4>
                  <ReviewText rubric={data.rubric} review={review} />
                </li>
              ))}
            </RecordList>
          )}
        </RecordSection>
      ) : null}
    </>
  );
}
