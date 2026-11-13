import type { PageBatchAction } from "@faridalms/domain/website";
import type {
  BatchAction,
  Column,
  RowAction,
} from "@faridalms/ui/system/data-table";

import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  EyeOff,
  FileText,
  IndentDecrease,
  IndentIncrease,
  ListMinus,
  ListPlus,
  Paintbrush,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { siteOverviewQuery } from "~/queries/site";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { batchSitePages, moveSitePage } from "~/server/site";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { sitePath } from "~/utils/host";

import { STATE_LABEL, STATE_TONE } from "./format";
import { Starters } from "./Starters";

type Overview = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>;
type Page = Overview["pages"][number];
type Row = Page & { depth: number; siblings: Page[]; index: number };

/** The page tree flattened in menu order, each page knowing its depth and siblings. */
function flatten(pages: Page[]): Row[] {
  const rows: Row[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const siblings = pages.filter((page) => page.parentId === parentId);
    siblings.forEach((page, index) => {
      rows.push({ ...page, depth, siblings, index });
      visit(page.id, depth + 1);
    });
  };
  visit(null, 0);
  return rows;
}

const titleOf = (page: Page, primary: "en" | "ar") =>
  (primary === "ar" ? page.titleAr : page.titleEn) ||
  page.titleEn ||
  page.titleAr;

const report = (error: unknown) => toast.error(getMessageFromError(error));

const pageCard = (primary: "en" | "ar") => ({
  title: (row: Row) => <Title row={row} primary={primary} />,
  status: (row: Row) => <State row={row} />,
});

/** Which of the chosen pages an action can be done to. */
const takes: Record<PageBatchAction, (row: Row) => boolean> = {
  publish: (row) => row.state !== "published" || row.changed,
  unpublish: (row) => row.state === "published",
  showInMenu: (row) => !row.inMenu,
  hideFromMenu: (row) => row.inMenu,
  remove: (row) => !row.isHome,
};

const DONE: Record<PageBatchAction, (input: { count: string }) => string> = {
  publish: m.siteBatchPublished,
  unpublish: m.siteBatchUnpublished,
  showInMenu: m.siteBatchShown,
  hideFromMenu: m.siteBatchHidden,
  remove: m.siteBatchRemoved,
};

interface TitleProps {
  row: Row;
  primary: "en" | "ar";
}

function Title({ row, primary }: TitleProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}
    >
      <RowLink to="/site-page-editor" search={{ id: row.id }}>
        {titleOf(row, primary)}
      </RowLink>
      {row.isHome ? (
        <Badge variant="secondary" className="shrink-0">
          {m.siteHome()}
        </Badge>
      ) : null}
    </div>
  );
}

interface StateProps {
  row: Row;
}

function State({ row }: StateProps) {
  return (
    <div className="grid gap-0.5">
      <StatusText tone={STATE_TONE[row.shown]}>
        {STATE_LABEL[row.shown]()}
      </StatusText>
      {row.changed ? (
        <span className="text-[13px] text-muted-foreground">
          {m.siteUnpublishedChanges()}
        </span>
      ) : null}
    </div>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(primary: "en" | "ar"): Column<Row>[] {
  return [
    {
      id: "title",
      header: m.sitePageTitle(),
      primary: true,
      cell: (row) => <Title row={row} primary={primary} />,
    },
    { id: "state", header: m.siteState(), cell: (row) => <State row={row} /> },
    {
      id: "address",
      header: m.siteAddress(),
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {row.isHome ? "/" : `/pages/${row.slug}`}
        </span>
      ),
    },
    {
      id: "menu",
      header: m.siteInMenu(),
      cell: (row) => <Value>{row.inMenu ? m.commonYes() : m.commonNo()}</Value>,
    },
  ];
}

export interface SitePagesProps {
  overview: Overview;
}

/** The website's pages as one list: open, order, nest, publish and remove them, one by one or many at once. */
export function SitePages({ overview }: SitePagesProps) {
  const user = useCurrentUser();
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const primary = overview.settings.primaryLocale;
  const rows = flatten(overview.pages);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["site"] });
  const move = async (row: Row, parentId: string | null, position: number) => {
    try {
      await moveSitePage({
        data: { id: row.id, parentId: parentId ?? "", position },
      });
      await refresh();
    } catch (error) {
      report(error);
    }
  };
  /**
   * Does an action to the chosen pages that can take it, all of them or
   * none, and says how many it did and how many it had to leave.
   */
  const apply = async (action: PageBatchAction, chosen: Row[]) => {
    const fit = chosen.filter(takes[action]);
    if (fit.length === 0) {
      toast.info(m.siteBatchNone());
      return;
    }
    try {
      await batchSitePages({
        data: {
          action,
          pages: fit.map((row) => ({
            id: row.id,
            expectedVersion: row.version,
          })),
        },
      });
    } catch (error) {
      const pageId =
        error && typeof error === "object" && "data" in error
          ? (error.data as { pageId?: string } | undefined)?.pageId
          : undefined;
      const stopped = fit.find((row) => row.id === pageId);
      await refresh();
      throw new Error(
        stopped
          ? m.siteBatchStopped({
              title: titleOf(stopped, primary),
              reason: getMessageFromError(error),
            })
          : getMessageFromError(error),
        { cause: error },
      );
    }
    await refresh();
    toast.success(DONE[action]({ count: formatNumber(fit.length) }), {
      description:
        fit.length < chosen.length
          ? m.siteBatchSkipped({
              count: formatNumber(chosen.length - fit.length),
            })
          : undefined,
    });
  };
  const one = (action: PageBatchAction, row: Row) => () =>
    apply(action, [row]).catch(report);
  const rowActions = (row: Row): RowAction[] => {
    const before = row.siblings[row.index - 1];
    const parent = overview.pages.find((page) => page.id === row.parentId);
    const actions: (RowAction | false)[] = [
      {
        label: m.siteEditPage(),
        icon: Pencil,
        inline: true,
        onSelect: () =>
          navigate({ to: "/site-page-editor", search: { id: row.id } }),
      },
      row.state === "published" && {
        label: m.siteViewPage(),
        icon: ExternalLink,
        onSelect: () => {
          window.open(
            sitePath(user.school.slug, row.isHome ? "/" : `/pages/${row.slug}`),
            "_blank",
            "noopener",
          );
        },
      },
      takes.publish(row) && {
        label: m.sitePublish(),
        icon: Send,
        onSelect: one("publish", row),
      },
      takes.unpublish(row) && {
        label: m.siteUnpublish(),
        icon: EyeOff,
        onSelect: one("unpublish", row),
      },
      takes.showInMenu(row) && {
        label: m.siteShowInMenu(),
        icon: ListPlus,
        onSelect: one("showInMenu", row),
      },
      takes.hideFromMenu(row) && {
        label: m.siteHideFromMenu(),
        icon: ListMinus,
        onSelect: one("hideFromMenu", row),
      },
      row.index > 0 && {
        label: m.siteMoveUp(),
        icon: ArrowUp,
        onSelect: () => move(row, row.parentId, row.index - 1),
      },
      row.index < row.siblings.length - 1 && {
        label: m.siteMoveDown(),
        icon: ArrowDown,
        onSelect: () => move(row, row.parentId, row.index + 1),
      },
      before !== undefined &&
        !row.isHome &&
        !before.isHome && {
          label: m.siteNestUnder({ title: titleOf(before, primary) }),
          icon: IndentIncrease,
          onSelect: () => move(row, before.id, 999),
        },
      parent !== undefined && {
        label: m.siteMoveOut(),
        icon: IndentDecrease,
        onSelect: () => move(row, parent.parentId, 999),
      },
      takes.remove(row) && {
        label: m.siteRemovePage(),
        icon: Trash2,
        destructive: true as const,
        confirm: {
          title: m.siteRemovePageTitle({ title: titleOf(row, primary) }),
          body: m.siteRemovePageBody(),
          label: m.siteRemovePage(),
        },
        onSelect: one("remove", row),
      },
    ];
    return actions.filter((action): action is RowAction => Boolean(action));
  };
  const batch: BatchAction<Row>[] = [
    {
      label: m.sitePublish(),
      icon: Send,
      onSelect: (chosen) => apply("publish", chosen),
    },
    {
      label: m.siteUnpublish(),
      icon: EyeOff,
      onSelect: (chosen) => apply("unpublish", chosen),
    },
    {
      label: m.siteShowInMenu(),
      icon: ListPlus,
      onSelect: (chosen) => apply("showInMenu", chosen),
    },
    {
      label: m.siteHideFromMenu(),
      icon: ListMinus,
      onSelect: (chosen) => apply("hideFromMenu", chosen),
    },
    {
      label: m.siteRemovePage(),
      icon: Trash2,
      destructive: true,
      confirm: (chosen) => ({
        title: m.siteBatchRemoveTitle({
          count: formatNumber(chosen.filter(takes.remove).length),
        }),
        body: m.siteBatchRemoveBody(),
        label: m.siteRemovePage(),
      }),
      onSelect: (chosen) => apply("remove", chosen),
    },
  ];
  const create = (
    <ButtonLink to="/site-page-editor" search={{}}>
      <Plus aria-hidden />
      {m.siteNewPage()}
    </ButtonLink>
  );
  const home = overview.pages.find((page) => page.isHome);
  const locale = overview.settings.primaryLocale;
  const starters = (
    <Starters
      locale={locale}
      school={user.school.slug}
      news={overview.news[locale]}
      contact={overview.school.contact}
      pages={overview.pages}
      schoolName={{ en: overview.school.nameEn, ar: overview.school.nameAr }}
    />
  );
  if (rows.length === 0)
    return (
      <div className="grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid max-w-2xl gap-1">
            <h2 className="text-lg font-semibold">{m.siteStartersTitle()}</h2>
            <p className="text-sm text-muted-foreground">
              {m.siteStartersHint()}
            </p>
          </div>
          <ButtonLink to="/site-page-editor" search={{}} variant="outline">
            <Plus aria-hidden />
            {m.siteStartBlank()}
          </ButtonLink>
        </div>
        {starters}
      </div>
    );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => setStarting(true)}
        >
          <Sparkles aria-hidden />
          {m.siteUseAStarter()}
        </Button>
        {home ? (
          <ButtonLink
            to="/site-page-editor"
            search={{ id: home.id, panel: "styles" }}
            variant="outline"
          >
            <Paintbrush aria-hidden />
            {m.siteDesignSite()}
          </ButtonLink>
        ) : null}
        {create}
      </div>
      <DataTable
        caption={m.sitePagesCaption()}
        rows={rows}
        columns={columns(primary)}
        rowLabel={(row) => titleOf(row, primary)}
        rowActions={rowActions}
        batchActions={batch}
        card={pageCard(primary)}
        empty={{
          icon: FileText,
          title: m.siteNoPages(),
          description: m.siteNoPagesBody(),
          action: create,
        }}
      />
      <Dialog open={starting} onOpenChange={setStarting}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[min(1100px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>{m.siteStartersTitle()}</DialogTitle>
            <DialogDescription>
              {m.siteStartersExistingHint()}
            </DialogDescription>
          </DialogHeader>
          {starters}
        </DialogContent>
      </Dialog>
    </div>
  );
}
