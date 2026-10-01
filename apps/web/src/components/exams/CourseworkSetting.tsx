import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DetailsSection } from "~/components/system/DocumentPage";
import { SelectField, TextField } from "~/components/system/field";
import * as m from "~/i18n/messages";
import { courseworkQuery, examOverviewQuery } from "~/queries/exams";
import { setCoursework } from "~/server/exams";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { sessionName } from "./names";

const NONE = "none";

const boardOf = (session: {
  official: { board: string } | null;
  boardId: string | null;
}) => session.official?.board ?? session.boardId;

/**
 * Sets an assignment as assessed coursework for one of the school's exam
 * sessions, saved as soon as it is chosen. Schools without sessions see
 * nothing here.
 */
export function CourseworkSetting({
  assignmentId,
  board,
}: {
  assignmentId: string;
  /** The board of the class's programme, whose sessions come first. */
  board: string | null;
}) {
  const queryClient = useQueryClient();
  const overview = useQuery(examOverviewQuery).data;
  const current = useQuery({
    ...courseworkQuery(assignmentId),
    enabled: Boolean(assignmentId),
  }).data;
  const [component, setComponent] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { sessionId: string | null; component: string }) =>
      setCoursework({
        data: {
          assignmentId,
          sessionId: input.sessionId,
          component: input.component.trim() || null,
        },
      }),
    onSuccess: (saved) =>
      queryClient.setQueryData(courseworkQuery(assignmentId).queryKey, saved),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  if (!overview || !overview.sessions.length) return null;
  if (!assignmentId)
    return (
      <DetailsSection title={m.courseworkSectionAssessed()}>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.courseworkAssessedAfterSave()}
        </p>
      </DetailsSection>
    );
  const sessionId = current?.sessionId ?? NONE;
  const session = overview.sessions.find((row) => row.id === sessionId);
  const typed = component ?? current?.component ?? "";
  return (
    <DetailsSection title={m.courseworkSectionAssessed()}>
      <SelectField
        id="work-exam-session"
        label={m.courseworkAssessedFor()}
        hint={m.courseworkAssessedHint()}
        value={sessionId}
        disabled={mutation.isPending}
        options={[
          { value: NONE, label: m.courseworkNotAssessed() },
          ...overview.sessions
            .toSorted(
              (a, b) =>
                Number(boardOf(b) === board) - Number(boardOf(a) === board),
            )
            .map((row) => ({
              value: row.id,
              label: sessionName(row),
            })),
        ]}
        onChange={(value) =>
          mutation.mutate({
            sessionId: value === NONE ? null : value,
            component: typed,
          })
        }
      />
      {session ? (
        <>
          <TextField
            id="work-exam-component"
            label={m.courseworkComponent()}
            hint={m.courseworkComponentHint()}
            optional
            maxLength={120}
            value={typed}
            onChange={(event) => setComponent(event.target.value)}
            onBlur={() => {
              if (typed.trim() !== (current?.component ?? ""))
                mutation.mutate({ sessionId: session.id, component: typed });
            }}
          />
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {[
              session.declarationRequired
                ? m.courseworkAssessedDeclares()
                : null,
              m.courseworkAssessedAuthenticates(),
              m.courseworkAssessedKept({ date: formatDate(session.keepUntil) }),
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </>
      ) : null}
    </DetailsSection>
  );
}
