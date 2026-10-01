import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  FileText,
  IndentDecrease,
  IndentIncrease,
  Paintbrush,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { siteOverviewQuery } from "~/queries/site";

import { ButtonLink } from "~/components/app/ButtonLink";
import { Value } from "~/components/app/primitives";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { StatusText } from "~/components/system/status";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { moveSitePage, removeSitePage, unpublishSitePage } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

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

function Title({ row, primary }: { row: Row; primary: "en" | "ar" }) {
  return (
    <div
      className="flex min-w-0 items-center"
      style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}
    >
      <RowLink to="/admin/site-page-editor" search={{ id: row.id }}>
        {titleOf(row, primary)}
      </RowLink>
      {row.isHome ? (
        <span className="ms-2 text-[13px] text-muted-foreground">
          {m.siteHome()}
        </span>
      ) : null}
    </div>
  );
}

function State({ row }: { row: Row }) {
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

const pageCard = (primary: "en" | "ar") => ({
  title: (row: Row) => <Title row={row} primary={primary} />,
  status: (row: Row) => <State row={row} />,
});

/** The site's pages as its menu tree: reorder, nest, publish and open each. */
export function SitePages({ overview }: { overview: Overview }) {
  const user = useCurrentUser();
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const primary = overview.settings.primaryLocale;
  const rows = flatten(overview.pages);
  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      if (done) toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const move = (row: Row, parentId: string | null, position: number) =>
    run(() =>
      moveSitePage({
        data: { id: row.id, parentId: parentId ?? "", position },
      }),
    );
  const rowActions = (row: Row): RowAction[] => {
    const before = row.siblings[row.index - 1];
    const parent = overview.pages.find((page) => page.id === row.parentId);
    return [
      {
        label: m.siteEditPage(),
        icon: Pencil,
        inline: true,
        onSelect: () =>
          navigate({ to: "/admin/site-page-editor", search: { id: row.id } }),
      },
      ...(row.index > 0
        ? [
            {
              label: m.siteMoveUp(),
              icon: ArrowUp,
              onSelect: () => move(row, row.parentId, row.index - 1),
            },
          ]
        : []),
      ...(row.index < row.siblings.length - 1
        ? [
            {
              label: m.siteMoveDown(),
              icon: ArrowDown,
              onSelect: () => move(row, row.parentId, row.index + 1),
            },
          ]
        : []),
      ...(before && !row.isHome && !before.isHome
        ? [
            {
              label: m.siteNestUnder({ title: titleOf(before, primary) }),
              icon: IndentIncrease,
              onSelect: () => move(row, before.id, 999),
            },
          ]
        : []),
      ...(parent
        ? [
            {
              label: m.siteMoveOut(),
              icon: IndentDecrease,
              onSelect: () => move(row, parent.parentId, 999),
            },
          ]
        : []),
      ...(row.state === "published"
        ? [
            {
              label: m.siteUnpublish(),
              icon: EyeOff,
              onSelect: () =>
                run(
                  () =>
                    unpublishSitePage({
                      data: { id: row.id, expectedVersion: row.version },
                    }),
                  m.siteUnpublished(),
                ),
            },
          ]
        : []),
      ...(!row.isHome
        ? [
            {
              label: m.siteRemovePage(),
              icon: Trash2,
              destructive: true as const,
              confirm: {
                title: m.siteRemovePageTitle({ title: titleOf(row, primary) }),
                body: m.siteRemovePageBody(),
                label: m.siteRemovePage(),
              },
              onSelect: () =>
                run(
                  () => removeSitePage({ data: { id: row.id } }),
                  m.siteRemoved(),
                ),
            },
          ]
        : []),
    ];
  };
  const create = (
    <ButtonLink to="/admin/site-page-editor" search={{}}>
      <Plus aria-hidden />
      {m.siteNewPage()}
    </ButtonLink>
  );
  const home = overview.pages.find((page) => page.isHome);
  const locale = overview.settings.primaryLocale;
  const starters = (hasPages: boolean) => (
    <Starters
      locale={locale}
      school={user.school.slug}
      news={overview.news[locale]}
      contact={overview.school.contact}
      hasPages={hasPages}
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
          <ButtonLink
            to="/admin/site-page-editor"
            search={{}}
            variant="outline"
          >
            <Plus aria-hidden />
            {m.siteStartBlank()}
          </ButtonLink>
        </div>
        {starters(false)}
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
            to="/admin/site-page-editor"
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
          {starters(true)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
