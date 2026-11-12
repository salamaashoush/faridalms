import type { SubmissionFormat } from "@faridalms/domain/coursework";

import { MAX_PEER_REVIEWS, PEER_FORMATS } from "@faridalms/domain/peer-review";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Fact } from "@faridalms/ui/system/record-page";
import { useQuery } from "@tanstack/react-query";
import * as v from "valibot";

import type { AssignmentEditorPartProps } from "~/components/coursework/slots";
import type { ModuleFillings } from "~/utils/extension";

import {
  assignmentEditorParts,
  assignmentFacts,
  assignmentRecordTabs,
  workParts,
} from "~/components/coursework/slots";
import { CheckboxRow } from "~/components/people/fields";
import { DetailsSection } from "~/components/system/DocumentPage";
import * as m from "~/i18n/messages";
import { peerSettingsQuery } from "~/queries/peer";
import { getPeerSettings } from "~/server/peer";
import { formatNumber, instantFromLocal, localInput } from "~/utils/datetime";
import { fill } from "~/utils/extension";

import {
  PeerReviewPanel,
  PeerReviewWork,
  StudentPeerReviews,
} from "./PeerReview";

const COUNTS = Array.from({ length: MAX_PEER_REVIEWS }, (_, index) =>
  String(index + 1),
);

/** Peer review as the editor keeps it: the settings written out, empty for none. */
const keptSchema = v.object({
  reviews: v.number(),
  anonymous: v.boolean(),
  dueAt: v.string(),
  started: v.optional(v.boolean(), false),
});
type Kept = v.InferOutput<typeof keptSchema>;

const NEW: Kept = { reviews: 2, anonymous: true, dueAt: "", started: false };

function keptOf(value: string): Kept | null {
  if (!value) return null;
  try {
    const parsed = v.safeParse(keptSchema, JSON.parse(value));
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

const reviewed = (format: SubmissionFormat) => PEER_FORMATS.includes(format);

/** Whether classmates review the work, how many each, unnamed or not, and by when. */
function PeerSettings({
  format,
  dueAt,
  value,
  onChange,
}: AssignmentEditorPartProps) {
  if (!reviewed(format)) return null;
  const kept = keptOf(value);
  const set = (next: Kept | null) => onChange(next ? JSON.stringify(next) : "");
  return (
    <DetailsSection title={m.peerSection()}>
      <CheckboxRow
        label={m.peerOn()}
        hint={kept?.started ? m.peerStartedHint() : m.peerOnHint()}
        checked={kept !== null}
        disabled={kept?.started}
        onChange={(on) => set(on ? NEW : null)}
      />
      {kept ? (
        <>
          <SelectField
            id="peer-reviews"
            label={m.peerReviewsEach()}
            value={String(kept.reviews)}
            options={COUNTS.map((count) => ({
              value: count,
              label: formatNumber(Number(count)),
            }))}
            onChange={(reviews) => set({ ...kept, reviews: Number(reviews) })}
          />
          <CheckboxRow
            label={m.peerAnonymous()}
            hint={m.peerAnonymousHint()}
            checked={kept.anonymous}
            onChange={(anonymous) => set({ ...kept, anonymous })}
          />
          <TextField
            id="peer-due"
            label={m.peerDue()}
            hint={m.peerDueHint()}
            optional
            type="datetime-local"
            min={dueAt || undefined}
            value={localInput(kept.dueAt || null)}
            onChange={(event) =>
              set({ ...kept, dueAt: instantFromLocal(event.target.value) })
            }
          />
        </>
      ) : null}
    </DetailsSection>
  );
}

interface ByAssignmentProps {
  assignmentId: string;
}

/** How classmates review the work, among its settings. */
function PeerFact({ assignmentId }: ByAssignmentProps) {
  const peer = useQuery(peerSettingsQuery(assignmentId)).data;
  if (!peer) return null;
  return (
    <Fact label={m.peerSection()}>
      {peer.anonymous
        ? m.peerHowAnonymous({ count: peer.reviews })
        : m.peerHowNamed({ count: peer.reviews })}
    </Fact>
  );
}

interface WorkProps {
  assignmentId: string;
  studentId: string;
}

/** The reviews of a student's work, and those they wrote, beside it as it is marked. */
function GradingReviews({ assignmentId, studentId }: WorkProps) {
  const peer = useQuery(peerSettingsQuery(assignmentId)).data;
  return peer ? (
    <StudentPeerReviews assignmentId={assignmentId} studentId={studentId} />
  ) : null;
}

/** The classmates' work a student reviews, and the reviews of theirs. */
function LearnerReviews({ assignmentId }: WorkProps) {
  const peer = useQuery(peerSettingsQuery(assignmentId)).data;
  return peer ? <PeerReviewWork assignmentId={assignmentId} /> : null;
}

/** Peer review in the work's editor, record, marking and the student's page. */
export const PEER_REVIEW: ModuleFillings = {
  module: "peer_review",
  fillings: [
    fill(assignmentEditorParts, {
      key: "peer",
      section: "own",
      initial: (assignment) => ({
        queryKey: ["peer", "settings", "editor", assignment.id],
        queryFn: async () => {
          const peer = await getPeerSettings({
            data: { assignmentId: assignment.id },
          });
          return peer
            ? JSON.stringify({
                reviews: peer.reviews,
                anonymous: peer.anonymous,
                dueAt: peer.dueAt ?? "",
                started: peer.started,
              } satisfies Kept)
            : "";
        },
      }),
      sent: (value, format) => (reviewed(format) ? value : ""),
      Field: PeerSettings,
    }),
    fill(assignmentFacts, { key: "peer", Fact: PeerFact }),
    fill(assignmentRecordTabs, {
      value: "reviews",
      label: m.peerTab,
      query: (assignmentId) => ({
        queryKey: peerSettingsQuery(assignmentId).queryKey,
        queryFn: () => getPeerSettings({ data: { assignmentId } }),
      }),
      shows: (read, access) => read !== null && access.grade,
      Tab: PeerReviewPanel,
    }),
    fill(workParts, { key: "peer", where: "grading", Part: GradingReviews }),
    fill(workParts, { key: "peer", where: "learner", Part: LearnerReviews }),
  ],
};
