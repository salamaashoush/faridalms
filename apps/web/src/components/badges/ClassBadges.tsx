import { BADGE_DAYS } from "@faridalms/domain/badges";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Printer, QrCode } from "lucide-react";
import { useCallback, useState } from "react";

import { initialsOf } from "~/components/app/UserMenu";
import { classTitle } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import { ActionMenu, runAndReport } from "~/components/system/ActionMenu";
import { ConfirmDialog } from "~/components/system/ConfirmDialog";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { RecordList, RecordSection } from "~/components/system/RecordPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classBadgesQuery } from "~/queries/badges";
import { issueBadges, stopBadge } from "~/server/badges";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { PrintedBadge } from "./BadgeSheet";

import { BadgeSheet } from "./BadgeSheet";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classBadgesQuery>["queryFn"]>>
>;
type Student = Data["students"][number];

function badgeLine(student: Student) {
  const badge = student.badge;
  if (!badge) return m.badgesNone();
  if (badge.expired)
    return m.badgesExpired({ date: formatInstant(badge.expiresAt, "stamp") });
  return badge.lastUsedAt
    ? m.badgesUsed({ date: formatInstant(badge.lastUsedAt, "stamp") })
    : m.badgesUnused({ date: formatInstant(badge.issuedAt, "stamp") });
}

/**
 * A teacher's sign-in badges for one class: who holds a working badge, new
 * badges printed for everyone or for one child who lost theirs, and a badge
 * stopped when it went missing.
 */
export function ClassBadges({ classId }: { classId: string }) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(classBadgesQuery(classId)).data;
  const [confirmAll, setConfirmAll] = useState(false);
  const [printed, setPrinted] = useState<{
    badges: PrintedBadge[];
    disabled: boolean;
  } | null>(null);
  const issue = useServerFn(issueBadges);
  const stop = useServerFn(stopBadge);
  const young = data.students.filter((student) => student.young);
  const older = data.students.length - young.length;
  const title = classTitle(data.class);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["badges", classId] });
  const print = useMutation({
    meta: { inlineError: true },
    mutationFn: (studentIds: string[]) =>
      issue({ data: { classId, studentIds } }),
    onSuccess: async (result) => {
      setConfirmAll(false);
      setPrinted({
        badges: result.badges.map((badge) => {
          const student = data.students.find(
            (row) => row.userId === badge.studentId,
          );
          return {
            studentId: badge.studentId,
            secret: badge.secret,
            name: student ? displayName(student) : "",
          };
        }),
        disabled: result.disabled.length > 0,
      });
      await refresh();
    },
  });
  const done = useCallback(() => setPrinted(null), []);

  const youngIds = young.map((student) => student.userId);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={m.badgesTitle()}
        description={m.badgesIntro({ days: formatNumber(BADGE_DAYS) })}
        action={
          young.length > 0
            ? {
                label: m.badgesPrintAll(),
                icon: Printer,
                onClick: () => {
                  if (young.some((student) => student.badge))
                    setConfirmAll(true);
                  else runAndReport(() => print.mutateAsync(youngIds));
                },
              }
            : undefined
        }
      />
      {young.length === 0 ? (
        <EmptyState icon={QrCode} title={m.badgesNoYoung()} />
      ) : (
        <RecordSection title={title}>
          <RecordList>
            {young.map((student) => {
              const name = displayName(student);
              return (
                <li
                  key={student.userId}
                  className="flex items-start gap-3 py-3"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                  >
                    {initialsOf(name)}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <bdi className="text-sm leading-5 font-medium">{name}</bdi>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {badgeLine(student)}
                    </span>
                  </div>
                  <ActionMenu
                    label={m.badgesActions({ name })}
                    actions={[
                      {
                        label: m.badgesPrintOne(),
                        icon: Printer,
                        onSelect: () => print.mutateAsync([student.userId]),
                        ...(student.badge && !student.badge.expired
                          ? {
                              confirm: {
                                title: m.badgesPrintOneTitle({ name }),
                                body: m.badgesPrintOneBody({ name }),
                                label: m.badgesPrintOne(),
                              },
                            }
                          : {}),
                      },
                      ...(student.badge && !student.badge.expired
                        ? [
                            {
                              label: m.badgesStop(),
                              icon: Ban,
                              destructive: true as const,
                              confirm: {
                                title: m.badgesStopTitle({ name }),
                                body: m.badgesStopBody({ name }),
                                label: m.badgesStop(),
                              },
                              onSelect: async () => {
                                await stop({
                                  data: { classId, studentId: student.userId },
                                });
                                await refresh();
                              },
                            },
                          ]
                        : []),
                    ]}
                  />
                </li>
              );
            })}
          </RecordList>
          {older > 0 ? (
            <p className="pt-3 text-[13px] leading-[18px] text-muted-foreground">
              {m.badgesOlder()}
            </p>
          ) : null}
        </RecordSection>
      )}
      <ConfirmDialog
        open={confirmAll}
        title={m.badgesPrintAllTitle()}
        body={m.badgesPrintAllBody()}
        confirmLabel={m.badgesPrintNew()}
        pending={print.isPending}
        error={print.error ? getMessageFromError(print.error) : undefined}
        onConfirm={() => print.mutate(youngIds)}
        onCancel={() => setConfirmAll(false)}
      />
      {printed ? (
        <BadgeSheet
          badges={printed.badges}
          schoolName={inLocale(user.school.nameEn, user.school.nameAr)}
          className={title}
          warnings={printed.disabled ? [m.badgesDisabled()] : []}
          onDone={done}
        />
      ) : null}
    </div>
  );
}
