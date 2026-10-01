import type { LinkProps } from "@tanstack/react-router";

import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { House } from "lucide-react";
import * as v from "valibot";

import type { Tone } from "~/components/system/status";

import { classTitle } from "~/components/classes/format";
import { formatInstant } from "~/components/coursework/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { displayName } from "~/components/people/format";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { RecordColumns } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { familyHomeQuery } from "~/queries/home";
import { formatDate } from "~/utils/datetime";

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

function ChildCard({
  child,
  timeZone,
  single,
}: {
  child: Child;
  timeZone: string;
  single: boolean;
}) {
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
                    row.dueAt ? formatInstant(row.dueAt, timeZone) : null,
                  ]}
                />
              ))}
            </HomeList>
          </div>
        ) : null}
        {!presence && child.attention.length === 0 && child.due.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.homeChildClear()}</p>
        ) : null}
      </div>
    </HomeCard>
  );
}

/**
 * A family's home: each child's day and anything that needs the family,
 * then pinned news and the latest newsletter. The chosen child stays in the
 * address.
 */
function FamilyHome() {
  const { child } = Route.useSearch();
  const user = useCurrentUser();
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
              facts={[thread.lastBody?.slice(0, 80)]}
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
              facts={[row.summary.slice(0, 100)]}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.newsletter ? (
      <HomeCard
        key="newsletter"
        title={m.homeLatestNewsletter()}
        action={{
          label: m.homeOpenNewsletters(),
          link: { to: "/newsletters", search: {} },
        }}
      >
        <HomeList>
          <HomeItem
            title={
              <Link
                to="/newsletters/$newsletterId"
                params={{ newsletterId: data.newsletter.id }}
                className={itemLink}
              >
                <bdi>{data.newsletter.title}</bdi>
              </Link>
            }
            facts={[data.newsletter.summary.slice(0, 120)]}
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
              timeZone={user.school.timeZone}
              single={data.children.length === 1}
            />
          ))}
          aside={aside.length ? aside : undefined}
        />
      )}
    </>
  );
}
