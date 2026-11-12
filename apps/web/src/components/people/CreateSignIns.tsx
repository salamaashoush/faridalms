import type { SignInRefusal, SignInWay } from "@faridalms/domain/first-sign-in";

import { SIGN_IN_REFUSALS } from "@faridalms/domain/first-sign-in";
import { ChoiceField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { signInsPlanQuery } from "~/queries/students";
import { createSignIns } from "~/server/students";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { OpenedSignIns } from "./slots";

import { SignInSlips } from "./SignInSlips";
import { signInWays } from "./slots";

interface Picked {
  id: string;
  name: string;
  className: string | null;
}

type Refused = Partial<
  Record<SignInRefusal, (input: { names: string }) => string>
>;

const REFUSED: Refused = {
  no_name: m.signInsRefusedNoName,
  disabled: m.signInsRefusedDisabled,
};

/**
 * Who was left without a new sign-in: those who needed none, to know of, and
 * those who could not be given one, each group named with its reason, to
 * act on.
 */
function leftOut(
  students: readonly Picked[],
  outcome: Pick<OpenedSignIns, "had" | "refused">,
  refused: Refused,
): { notes: string[]; warnings: string[] } {
  const named = (ids: readonly string[]) =>
    formatList(
      ids.flatMap(
        (id) => students.find((student) => student.id === id)?.name ?? [],
      ),
    );
  return {
    notes:
      outcome.had.length > 0
        ? [m.signInsHad({ names: named(outcome.had) })]
        : [],
    warnings: SIGN_IN_REFUSALS.flatMap((reason) => {
      const ids = outcome.refused
        .filter((refusal) => refusal.reason === reason)
        .map((refusal) => refusal.studentId);
      const words = refused[reason];
      return ids.length > 0 && words ? [words({ names: named(ids) })] : [];
    }),
  };
}

export interface CreateSignInsProps {
  students: readonly Picked[];
  onClose: () => void;
}

/**
 * Opens sign-ins for the students picked in the list. The office chooses how
 * each student gets theirs and sees who that covers before anything is made;
 * what is made then shows once, on a sheet to print.
 */
export function CreateSignIns({ students, onClose }: CreateSignInsProps) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const ways = useSlot(signInWays).toSorted((a, b) => a.place - b.place);
  const refused = ways.reduce<Refused>(
    (all, option) => ({ ...all, ...option.refused }),
    REFUSED,
  );
  const [way, setWay] = useState<SignInWay>("slips");
  const chosen = ways.find((option) => option.way === way);
  const [nothing, setNothing] = useState(false);
  const [opened, setOpened] = useState<OpenedSignIns | null>(null);
  const input = { studentIds: students.map((student) => student.id), way };
  const plan = useQuery(signInsPlanQuery(input));
  const mutation = useMutation({
    mutationFn: () => createSignIns({ data: input }),
    meta: { inlineError: true },
  });
  const failure = mutation.error ?? plan.error;

  if (opened) {
    const left = leftOut(students, opened, refused);
    const schoolName = inLocale(user.school.nameEn, user.school.nameAr);
    const of = (studentId: string) =>
      students.find((student) => student.id === studentId);
    return chosen?.Made ? (
      <chosen.Made
        opened={opened}
        student={(studentId) => ({
          name: of(studentId)?.name ?? "",
          className: of(studentId)?.className ?? null,
        })}
        schoolName={schoolName}
        {...left}
        onDone={onClose}
      />
    ) : (
      <SignInSlips
        slips={opened.slips.map((slip) => ({
          ...slip,
          name: of(slip.studentId)?.name ?? "",
          className: of(slip.studentId)?.className ?? null,
        }))}
        schoolName={schoolName}
        {...left}
        onDone={onClose}
      />
    );
  }

  const ready = plan.data?.ready.length ?? 0;
  const left = plan.data ? leftOut(students, plan.data, refused) : null;
  const count = { count: ready, value: formatNumber(ready) };
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentsCreateSignIns()}
      submitLabel={chosen?.sent ? chosen.sent.submit() : m.signInsSubmit()}
      pending={mutation.isPending}
      error={failure ? getMessageFromError(failure) : null}
      onSubmit={async () => {
        if (!plan.data) return;
        if (ready === 0) {
          setNothing(true);
          return;
        }
        await mutation.mutateAsync().then(
          async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["people"] });
            // What is sent leaves nothing here to print.
            if (!chosen?.sent) return setOpened(result);
            const sent = result.invited.length;
            if (sent > 0)
              toast.success(
                chosen.sent.done({ count: sent, value: formatNumber(sent) }),
              );
            for (const line of leftOut(students, result, refused).warnings)
              toast.warning(line);
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.signInsHint()}
      </p>
      <ChoiceField
        label={m.signInsWay()}
        value={way}
        options={[
          {
            value: "slips",
            label: m.signInsWaySlips(),
            hint: m.signInsWaySlipsHint(),
          },
          ...ways.map((option) => ({
            value: option.way,
            label: option.label(),
            hint: option.hint(),
          })),
        ]}
        onChange={(next) => {
          setNothing(false);
          setWay(next);
        }}
        errors={nothing ? [m.signInsNothing()] : undefined}
      />
      {left ? (
        <output className="grid gap-1.5 rounded-lg bg-muted p-3 text-sm leading-5">
          {ready > 0 ? (
            <span>
              {chosen ? chosen.ready(count) : m.signInsReadySlips(count)}
            </span>
          ) : nothing ? null : (
            <span>{m.signInsNothing()}</span>
          )}
          {[...left.notes, ...left.warnings].map((line) => (
            <span
              key={line}
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {line}
            </span>
          ))}
        </output>
      ) : null}
    </SheetForm>
  );
}
