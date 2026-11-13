import { RecordSection } from "@faridalms/ui/system/record-page";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { runningDefaultQuery, runningShownQuery } from "~/queries/gradebook";
import { setRunningDefault, showRunning } from "~/server/gradebook";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

export interface ShowRunningProps {
  classId: string;
  /** The book is a term's, so the running grade covers the term. */
  termed: boolean;
}

/** The teacher's choice, in the class's book, of showing its students their running grade. */
export function ShowRunning({ classId, termed }: ShowRunningProps) {
  const queryClient = useQueryClient();
  const words = useWords();
  const { data } = useSuspenseQuery(runningShownQuery(classId));
  const mutation = useMutation({
    mutationFn: (shown: boolean) =>
      showRunning({
        data: { classId, shown, expectedVersion: data.version },
      }),
    meta: { inlineError: true },
  });
  return (
    <CheckboxRow
      label={m.gradebookShowRunning()}
      hint={
        termed
          ? words(m.gradebookShowRunningHintCore)()
          : m.gradebookShowRunningHintCore()
      }
      checked={data.shown}
      disabled={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : undefined}
      onChange={async (shown) => {
        try {
          await mutation.mutateAsync(shown);
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["gradebook"] });
        toast.success(
          shown
            ? m.gradebookRunningShownToast()
            : m.gradebookRunningHiddenToast(),
        );
      }}
    />
  );
}

/** Whether the school's new classes show their students their running grade, among its grading settings. */
export function RunningDefault() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(runningDefaultQuery);
  const mutation = useMutation({
    mutationFn: (runningShown: boolean) =>
      setRunningDefault({
        data: { runningShown, expectedVersion: data.version },
      }),
    meta: { inlineError: true },
  });
  return (
    <RecordSection
      title={m.gradebookRunningDefaultTitle()}
      description={m.gradebookRunningDefaultHint()}
    >
      <CheckboxRow
        label={m.gradebookRunningDefault()}
        checked={data.runningShown}
        disabled={mutation.isPending}
        error={mutation.error ? getMessageFromError(mutation.error) : undefined}
        onChange={async (shown) => {
          try {
            await mutation.mutateAsync(shown);
          } catch {
            return;
          }
          await queryClient.invalidateQueries({ queryKey: ["gradebook"] });
          toast.success(m.managementSaved());
        }}
      />
    </RecordSection>
  );
}
