import type { Tone } from "@faridalms/ui/system/status";
import type { LinkProps } from "@tanstack/react-router";

import { Button } from "@faridalms/ui/button";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordColumns } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { House, LoaderCircle, Smile } from "lucide-react";
import { Fragment } from "react";
import * as v from "valibot";

import { classTitle } from "~/components/classes/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { familyChildParts } from "~/components/home/slots";
import { displayName } from "~/components/people/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useSessionChange } from "~/hooks/useSessionChange";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { followedHomeQuery } from "~/queries/home";
import { currentUserQuery } from "~/queries/user";
import { startChildMode } from "~/server/auth";
import { formatInstant, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { filled } from "~/utils/extension";

export const Route = createFileRoute("/_app/family/")({
  validateSearch: v.object({
    child: v.fallback(
      v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
      "",
    ),
  }),
  search: { middlewares: [stripSearchParams({ child: "" })] },
  loaderDeps: ({ search }) => ({ child: search.child }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(followedHomeQuery(deps.child)),
      ...filled(context.extensions, user.modules, familyChildParts).flatMap(
        (part) => {
          const query = part.query(user.capabilities);
          return query ? [context.queryClient.ensureQueryData(query)] : [];
        },
      ),
    ]);
  },
  component: FamilyHome,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof followedHomeQuery>["queryFn"]>>
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

interface HandOverProps {
  child: Child;
}

/**
 * Hands this device to a young child for their lessons. The child sees only
 * their own home; a grown-up's answer brings the family account back.
 */
function HandOver({ child }: HandOverProps) {
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

interface ChildCardProps {
  child: Child;
  single: boolean;
}

function ChildCard({ child, single }: ChildCardProps) {
  const presence = PRESENCE[child.presence];
  const { capabilities } = useCurrentUser();
  const parts = useSlot(familyChildParts).flatMap((part) => {
    const query = part.query(capabilities);
    return query ? [{ part, query }] : [];
  });
  const reads = useSuspenseQueries({
    queries: parts.map((row) => row.query),
  });
  const childParts = parts.map((row, index) => ({
    part: row.part,
    read: reads[index]?.data,
  }));
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
          <EmptyState
            placement="section"
            kind="done"
            title={m.homeChildClear()}
          />
        ) : null}
        {childParts.map((part, index) => (
          <Fragment key={index}>{part.part.partOf(part.read, child)}</Fragment>
        ))}
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
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(followedHomeQuery(child)).data;
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
    data.announcements.length > 0 ? (
      <HomeCard
        key="announcements"
        title={m.homeAnnouncements()}
        action={{
          label: m.homeOpenAnnouncements(),
          link: { to: "/announcements", search: {} },
        }}
      >
        <HomeList>
          {data.announcements.map((row) => (
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
  ].filter(Boolean);
  return (
    <Page width="list">
      <PageHeader title={m.navHome()} description={formatDate(data.today)} />
      {data.choices.length > 1 ? (
        <div className="mb-6">
          <IndexToolbar
            facets={[
              {
                id: "child",
                label: m.courseworkChild(),
                single: true,
                options: data.choices.map((choice) => ({
                  value: choice.studentId,
                  label: displayName(choice),
                })),
                selected: child ? [child] : [],
                onChange: ([next]) =>
                  void navigate({ search: { child: next ?? "" } }),
              },
            ]}
          />
        </div>
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
    </Page>
  );
}
