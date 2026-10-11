import type { SignInRefusal, SignInWay } from "@faridalms/domain/first-sign-in";

import { INVITE_DAYS, SIGN_IN_REFUSALS } from "@faridalms/domain/first-sign-in";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { BadgeSheet } from "~/components/badges/BadgeSheet";
import { ChoiceField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { signInsPlanQuery } from "~/queries/students";
import { createSignIns } from "~/server/students";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { SignInSlips } from "./SignInSlips";

interface Picked {
  id: string;
  name: string;
  className: string | null;
}

type Opened = Awaited<ReturnType<typeof createSignIns>>;

const REFUSED: Record<SignInRefusal, (input: { names: string }) => string> = {
  no_name: m.signInsRefusedNoName,
  disabled: m.signInsRefusedDisabled,
  not_young: m.signInsRefusedNotYoung,
  no_email: m.signInsRefusedNoEmail,
  not_sent: m.signInsRefusedNotSent,
};

/**
 * Who was left without a new sign-in: those who needed none, to know of, and
 * those who could not be given one, each group named with its reason, to
 * act on.
 */
function leftOut(
  students: readonly Picked[],
  outcome: Pick<Opened, "had" | "refused">,
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
      return ids.length > 0 ? [REFUSED[reason]({ names: named(ids) })] : [];
    }),
  };
}

/**
 * Opens sign-ins for the students picked in the list. The office chooses how
 * each student gets theirs and sees who that covers before anything is made;
 * what is made then shows once, on a sheet to print.
 */
export function CreateSignIns({
  students,
  onClose,
}: {
  students: readonly Picked[];
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [way, setWay] = useState<SignInWay>("slips");
  const [nothing, setNothing] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const input = { studentIds: students.map((student) => student.id), way };
  const plan = useQuery(signInsPlanQuery(input));
  const mutation = useMutation({
    mutationFn: () => createSignIns({ data: input }),
    meta: { inlineError: true },
  });
  const failure = mutation.error ?? plan.error;

  if (opened) {
    const left = leftOut(students, opened);
    const schoolName = inLocale(user.school.nameEn, user.school.nameAr);
    const of = (studentId: string) =>
      students.find((student) => student.id === studentId);
    return opened.badges.length > 0 ? (
      <BadgeSheet
        badges={opened.badges.map((badge) => ({
          ...badge,
          name: of(badge.studentId)?.name ?? "",
          className: of(badge.studentId)?.className,
        }))}
        school={user.school.slug}
        schoolName={schoolName}
        className={null}
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
        school={user.school.slug}
        schoolName={schoolName}
        {...left}
        onDone={onClose}
      />
    );
  }

  const ready = plan.data?.ready.length ?? 0;
  const left = plan.data ? leftOut(students, plan.data) : null;
  const count = { count: ready, value: formatNumber(ready) };
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentsCreateSignIns()}
      submitLabel={way === "email" ? m.signInsSubmitEmail() : m.signInsSubmit()}
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
            // Links are in the post, with nothing here to print.
            if (way !== "email") return setOpened(result);
            const sent = result.invited.length;
            if (sent > 0)
              toast.success(
                m.signInsEmailed({ count: sent, value: formatNumber(sent) }),
              );
            for (const line of leftOut(students, result).warnings)
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
          {
            value: "badges",
            label: m.signInsWayBadges(),
            hint: m.signInsWayBadgesHint(),
          },
          {
            value: "email",
            label: m.signInsWayEmail(),
            hint: m.signInsWayEmailHint({ days: INVITE_DAYS }),
          },
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
              {way === "slips"
                ? m.signInsReadySlips(count)
                : way === "badges"
                  ? m.signInsReadyBadges(count)
                  : m.signInsReadyEmail(count)}
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
