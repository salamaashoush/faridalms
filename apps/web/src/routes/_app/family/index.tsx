import type { NextYearIntention } from "@faridalms/domain/rollover";
import type { Tone } from "@faridalms/ui/system/status";
import type { LinkProps } from "@tanstack/react-router";

import { NEXT_YEAR_INTENTIONS } from "@faridalms/domain/rollover";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordColumns } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { House, LoaderCircle, Smile } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { classTitle } from "~/components/classes/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSessionChange } from "~/hooks/useSessionChange";
import * as m from "~/i18n/messages";
import { familyHomeQuery } from "~/queries/home";
import { startChildMode } from "~/server/auth";
import { setIntention } from "~/server/rollover";
import { formatInstant, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/family/")({
  validateSearch: v.object({
    child: v.fallback(
      v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
      "",
    ),
  }),
  search: { middlewares: [stripSearchParams({ child: "" })] },
  loaderDeps: ({ search }) => ({ child: search.child }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(familyHomeQuery(deps.child)),
  component: FamilyHome,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof familyHomeQuery>["queryFn"]>>
>;
type Child = Data["children"][number];

const PRESENCE: Record<
  Child["presence"],
  { label: () => string; tone: Tone } | null
> = {
  present: { label: m.homePresent, tone: "success" },
  late: { label: m.homeLate, tone: "warning" },
  absent: { label: m.homeAbsent, tone: "neutral" },
  absent_unexplained: { label: m.homeAbsentUnexplained, tone: "danger" },
  none: null,
};

const chip =
  "inline-flex min-h-9 items-center rounded-full border px-3 text-sm hover:bg-muted aria-[current=page]:border-primary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary";

function attentionOf(
  item: Child["attention"][number],
  child: Child,
): { label: string; link: LinkProps } {
  const search = { studentId: child.studentId };
  switch (item.kind) {
    case "absence":
      return {
        label: m.homeAttentionAbsence(),
        link: { to: "/family/attendance", search },
      };
    case "missing":
      return {
        label: m.homeAttentionMissing({ title: item.title }),
        link: { to: "/family/assignments", search },
      };
    case "result":
      return {
        label: m.homeAttentionResult({ title: item.title }),
        link: { to: "/family/grades", search },
      };
  }
  return { label: "", link: { to: "/family" } };
}

const lesson = (slot: Child["now"], label: string) =>
  slot
    ? `${label}: ${classTitle({ code: slot.classCode, titleEn: slot.classTitleEn, titleAr: slot.classTitleAr })}`
    : null;

/**
 * Hands this device to a young child for their lessons. The child sees only
 * their own home; a grown-up's answer brings the family account back.
 */
function HandOver({ child }: { child: Child }) {
  const sessionChanged = useSessionChange();
  const start = useServerFn(startChildMode);
  const name = displayName(child);
  const handOver = useMutation({
    mutationFn: () => start({ data: { studentId: child.studentId } }),
    meta: { inlineError: true },
    onSuccess: async () => {
      await sessionChanged("/");
    },
  });
  return (
    <div className="grid gap-2 border-t pt-4">
      <Button
        type="button"
        variant="outline"
        className="justify-self-start max-md:h-10"
        disabled={handOver.isPending}
        onClick={() => handOver.mutate()}
      >
        {handOver.isPending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <Smile aria-hidden />
        )}
        <bdi>{m.familyHandOver({ name })}</bdi>
      </Button>
      {handOver.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(handOver.error)}
        </p>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.familyHandOverHint({ name })}
        </p>
      )}
    </div>
  );
}

const INTENTION_LABEL = {
  returning: m.familyNextYearReturning,
  undecided: m.familyNextYearUndecided,
  leaving: m.familyNextYearLeaving,
} satisfies Record<NextYearIntention, () => string>;

/**
 * The school's question about a child's next year, for a guardian who
 * decides for them: each choice is kept as it is made, and can change
 * while the school is asking.
 */
function NextYear({
  child,
  nextYear,
}: {
  child: Child;
  nextYear: NonNullable<Child["nextYear"]>;
}) {
  const save = useServerFn(setIntention);
  const [chosen, setChosen] = useState(nextYear.intention);
  const answer = useMutation({
    mutationFn: (intention: NextYearIntention) =>
      save({ data: { studentId: child.studentId, intention } }),
    meta: { inlineError: true },
  });
  const legend = m.familyNextYearTitle({
    name: displayName(child),
    year: inLocale(nextYear.titleEn, nextYear.titleAr),
  });
  return (
    <fieldset className="grid gap-2 border-t pt-4">
      <legend className="float-start mb-1 text-sm font-semibold">
        <bdi>{legend}</bdi>
      </legend>
      <RadioGroup
        value={chosen ?? ""}
        onValueChange={(value) => {
          const intention = NEXT_YEAR_INTENTIONS.find((item) => item === value);
          if (!intention) return;
          setChosen(intention);
          answer.mutate(intention);
        }}
        className="grid gap-1"
      >
        {NEXT_YEAR_INTENTIONS.map((intention) => (
          <label
            key={intention}
            className="flex min-h-8 items-center gap-3 text-sm leading-5 max-md:min-h-10"
          >
            <RadioGroupItem value={intention} disabled={answer.isPending} />
            {INTENTION_LABEL[intention]()}
          </label>
        ))}
      </RadioGroup>
      {answer.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(answer.error)}
        </p>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {chosen ? m.familyNextYearKept() : m.familyNextYearHint()}
        </p>
      )}
    </fieldset>
  );
}

function ChildCard({ child, single }: { child: Child; single: boolean }) {
  const presence = PRESENCE[child.presence];
  return (
    <HomeCard
      title={displayName(child)}
      description={
        [lesson(child.now, m.homeNow()), lesson(child.next, m.homeNext())]
          .filter(Boolean)
          .join(" · ") || undefined
      }
      action={
        single
          ? undefined
          : {
              label: m.homeOpenChild(),
              link: { to: "/family", search: { child: child.studentId } },
            }
      }
    >
      <div className="grid gap-4">
        {presence ? (
          <p className="text-sm">
            <StatusText tone={presence.tone}>{presence.label()}</StatusText>
          </p>
        ) : null}
        {child.attention.length > 0 ? (
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">{m.homeNeedsAttention()}</h3>
            <HomeList>
              {child.attention.map((item) => {
                const shown = attentionOf(item, child);
                return (
                  <HomeItem
                    key={`${item.kind}-${item.id}`}
                    title={
                      <Link {...shown.link} className={itemLink}>
                        <bdi>{shown.label}</bdi>
                      </Link>
                    }
                    facts={[
                      item.classCode
                        ? classTitle({
                            code: item.classCode,
                            titleEn: item.classTitleEn,
                            titleAr: item.classTitleAr,
                          })
                        : null,
                    ]}
                  />
                );
              })}
            </HomeList>
          </div>
        ) : null}
        {child.due.length > 0 ? (
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">{m.homeDueThisWeek()}</h3>
            <HomeList>
              {child.due.map((row) => (
                <HomeItem
                  key={row.assignmentId}
                  title={
                    <bdi className="text-sm leading-5 font-medium">
                      {row.title}
                    </bdi>
                  }
                  facts={[
                    classTitle({
                      code: row.classCode,
                      titleEn: row.classTitleEn,
                      titleAr: row.classTitleAr,
                    }),
                    row.dueAt ? formatInstant(row.dueAt) : null,
                  ]}
                />
              ))}
            </HomeList>
          </div>
        ) : null}
        {!presence && child.attention.length === 0 && child.due.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.homeChildClear()}</p>
        ) : null}
        {child.nextYear ? (
          <NextYear child={child} nextYear={child.nextYear} />
        ) : null}
        {child.young ? <HandOver child={child} /> : null}
      </div>
    </HomeCard>
  );
}

/**
 * A family's home: each child's day and anything that needs the family,
 * then pinned announcements and the latest school news. The chosen child stays in the
 * address.
 */
function FamilyHome() {
  const { child } = Route.useSearch();
  const data = useSuspenseQuery(familyHomeQuery(child)).data;
  const aside = [
    data.messages.unread > 0 ? (
      <HomeCard
        key="messages"
        title={m.homeUnreadMessages()}
        description={m.homeUnreadCount({ count: data.messages.unread })}
        action={{
          label: m.homeOpenMessages(),
          link: { to: "/family/messages", search: {} },
        }}
      >
        <HomeList>
          {data.messages.threads.map((thread) => (
            <HomeItem
              key={thread.id}
              title={
                <Link
                  to="/family/messages"
                  search={{ thread: thread.id }}
                  className={itemLink}
                >
                  <bdi>
                    {inLocale(
                      thread.lastAuthorNameEn,
                      thread.lastAuthorNameAr,
                    ) || thread.subject}
                  </bdi>
                </Link>
              }
              summary={thread.lastBody ?? undefined}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.pinned.length > 0 ? (
      <HomeCard
        key="pinned"
        title={m.homePinnedNews()}
        action={{
          label: m.homeOpenAnnouncements(),
          link: { to: "/announcements", search: {} },
        }}
      >
        <HomeList>
          {data.pinned.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <Link
                  to="/announcements/$announcementId"
                  params={{ announcementId: row.id }}
                  className={itemLink}
                >
                  <bdi>{row.title}</bdi>
                </Link>
              }
              summary={row.summary}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.news ? (
      <HomeCard
        key="news"
        title={m.homeLatestNews()}
        action={{
          label: m.homeOpenNews(),
          link: { to: "/news", search: {} },
        }}
      >
        <HomeList>
          <HomeItem
            title={
              <Link
                to="/news/$postId"
                params={{ postId: data.news.id }}
                className={itemLink}
              >
                <bdi>
                  {inLocale(
                    data.news.titleEn || null,
                    data.news.titleAr || null,
                  )}
                </bdi>
              </Link>
            }
            summary={
              inLocale(
                data.news.excerptEn || null,
                data.news.excerptAr || null,
              ) || data.news.summary
            }
          />
        </HomeList>
      </HomeCard>
    ) : null,
  ].filter(Boolean);
  return (
    <>
      <PageHeader title={m.navHome()} description={formatDate(data.today)} />
      {data.choices.length > 1 ? (
        <nav aria-label={m.homeChildren()} className="mb-6">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                to="/family"
                search={{}}
                aria-current={child === "" ? "page" : undefined}
                className={chip}
              >
                {m.homeAllChildren()}
              </Link>
            </li>
            {data.choices.map((choice) => (
              <li key={choice.studentId}>
                <Link
                  to="/family"
                  search={{ child: choice.studentId }}
                  aria-current={child === choice.studentId ? "page" : undefined}
                  className={cn(chip)}
                >
                  {displayName(choice)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {data.choices.length === 0 ? (
        <EmptyState
          icon={House}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      ) : (
        <RecordColumns
          main={data.children.map((row) => (
            <ChildCard
              key={row.studentId}
              child={row}
              single={data.children.length === 1}
            />
          ))}
          aside={aside.length ? aside : undefined}
        />
      )}
    </>
  );
}
