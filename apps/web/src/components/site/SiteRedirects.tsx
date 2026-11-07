import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { isPageAddress, isRedirectFrom } from "@faridalms/domain/site-seo";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { siteOverviewQuery } from "~/queries/site";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { siteRedirectsQuery } from "~/queries/site";
import { removeSiteRedirect, saveSiteRedirect } from "~/server/site";
import { formatInstant } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Redirect = Awaited<
  ReturnType<NonNullable<(typeof siteRedirectsQuery)["queryFn"]>>
>[number];
type Page = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>["pages"][number];

// The choice of target that is an address rather than one of the pages.
const ADDRESS = "address";

interface Draft {
  id: string;
  expectedVersion: number;
  from: string;
  target: string;
  toUrl: string;
}

const blank: Draft = {
  id: "",
  expectedVersion: 0,
  from: "",
  target: "",
  toUrl: "",
};

const pageTitle = (page: Page) =>
  inLocale(page.titleEn || null, page.titleAr || null);

interface FromProps {
  row: Redirect;
}

function From({ row }: FromProps) {
  return (
    <span dir="ltr" className="font-medium break-all">
      {row.fromPath}
    </span>
  );
}

interface TargetProps {
  row: Redirect;
  pages: Map<string, Page>;
}

function Target({ row, pages }: TargetProps) {
  const page = row.toPageId ? pages.get(row.toPageId) : undefined;
  if (row.toUrl)
    return (
      <span dir="ltr" className="text-sm break-all text-muted-foreground">
        {row.toUrl}
      </span>
    );
  return <Value>{page ? pageTitle(page) : null}</Value>;
}

interface AddedProps {
  row: Redirect;
}

function Added({ row }: AddedProps) {
  return (
    <span className="grid text-sm">
      <Value>{inLocale(row.createdBy.en, row.createdBy.ar) || null}</Value>
      <span className="text-muted-foreground">
        {formatInstant(row.createdAt, "date")}
      </span>
    </span>
  );
}

function columns(pages: Map<string, Page>): Column<Redirect>[] {
  return [
    {
      id: "from",
      header: m.siteRedirectFrom(),
      primary: true,
      cell: (row) => <From row={row} />,
    },
    {
      id: "to",
      header: m.siteRedirectTo(),
      cell: (row) => <Target row={row} pages={pages} />,
    },
    {
      id: "by",
      header: m.siteRedirectAddedBy(),
      cell: (row) => <Added row={row} />,
    },
  ];
}

const redirectCard = (pages: Map<string, Page>) => ({
  title: (row: Redirect) => <From row={row} />,
  fact: (row: Redirect) => <Target row={row} pages={pages} />,
});

export interface SiteRedirectsProps {
  pages: Page[];
}

/**
 * Old addresses of the school's site, each sent on for good to one of its
 * pages or to another address, so links and search results from an
 * earlier site keep working.
 */
export function SiteRedirects({ pages }: SiteRedirectsProps) {
  const queryClient = useQueryClient();
  const redirects = useSuspenseQuery(siteRedirectsQuery).data;
  const byId = new Map(pages.map((page) => [page.id, page]));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shown, setShown] = useState(false);
  const save = useMutation({
    mutationFn: (value: Draft) =>
      saveSiteRedirect({
        data: {
          id: value.id,
          expectedVersion: value.expectedVersion,
          from: value.from.trim(),
          toPageId: value.target === ADDRESS ? "" : value.target,
          toUrl: value.target === ADDRESS ? value.toUrl.trim() : "",
        },
      }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["site", "redirects"] });
  const open = (value: Draft) => {
    save.reset();
    setShown(false);
    setDraft(value);
  };
  const issues = draft
    ? {
        from: isRedirectFrom(draft.from.trim())
          ? null
          : m.siteRedirectFromNeeded(),
        target:
          draft.target === ""
            ? m.siteRedirectTargetNeeded()
            : draft.target === ADDRESS && !isPageAddress(draft.toUrl.trim())
              ? m.siteAddressNeeded()
              : null,
      }
    : { from: null, target: null };
  const rowActions = (row: Redirect): RowAction[] => [
    {
      label: m.siteEditRedirect(),
      icon: Pencil,
      inline: true,
      onSelect: () =>
        open({
          id: row.id,
          expectedVersion: row.version,
          from: row.fromPath,
          target: row.toPageId ?? ADDRESS,
          toUrl: row.toUrl ?? "",
        }),
    },
    {
      label: m.siteRemoveRedirect(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.siteRemoveRedirectTitle({ from: row.fromPath }),
        body: m.siteRemoveRedirectBody(),
        label: m.siteRemoveRedirect(),
      },
      onSelect: async () => {
        try {
          await removeSiteRedirect({
            data: { id: row.id, expectedVersion: row.version },
          });
          await refresh();
          toast.success(m.siteRemoved());
        } catch (error) {
          toast.error(getMessageFromError(error));
        }
      },
    },
  ];
  const create = (
    <Button type="button" className="max-md:h-10" onClick={() => open(blank)}>
      <Plus aria-hidden />
      {m.siteNewRedirect()}
    </Button>
  );
  return (
    <div className="grid gap-4">
      {redirects.length > 0 ? (
        <div className="flex justify-end">{create}</div>
      ) : null}
      <DataTable
        caption={m.siteRedirectsCaption()}
        rows={redirects}
        columns={columns(byId)}
        rowLabel={(row) => row.fromPath}
        rowActions={rowActions}
        card={redirectCard(byId)}
        empty={{
          icon: CornerDownRight,
          title: m.siteNoRedirects(),
          description: m.siteNoRedirectsBody(),
          action: create,
        }}
      />
      <SheetForm
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next) setDraft(null);
        }}
        title={draft?.id ? m.siteEditRedirect() : m.siteNewRedirect()}
        pending={save.isPending}
        error={save.error ? getMessageFromError(save.error) : null}
        onSubmit={async () => {
          setShown(true);
          if (!draft || issues.from || issues.target) return;
          try {
            await save.mutateAsync(draft);
          } catch {
            return;
          }
          await refresh();
          toast.success(m.siteRedirectSaved());
          setDraft(null);
        }}
      >
        {draft ? (
          <>
            <TextField
              id="redirect-from"
              label={m.siteRedirectFrom()}
              hint={m.siteRedirectFromHint()}
              dir="ltr"
              maxLength={300}
              autoComplete="off"
              placeholder="/about-us.html"
              value={draft.from}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
              errors={shown && issues.from ? [issues.from] : undefined}
            />
            <SelectField
              id="redirect-target"
              label={m.siteRedirectTo()}
              value={draft.target}
              options={[
                ...(draft.target === ""
                  ? [{ value: "", label: m.siteRedirectChoose() }]
                  : []),
                ...pages.map((page) => ({
                  value: page.id,
                  label: pageTitle(page),
                })),
                { value: ADDRESS, label: m.siteRedirectToAddress() },
              ]}
              onChange={(target) => setDraft({ ...draft, target })}
              errors={
                shown && issues.target && draft.target !== ADDRESS
                  ? [issues.target]
                  : undefined
              }
            />
            {draft.target === ADDRESS ? (
              <TextField
                id="redirect-address"
                label={m.siteRedirectAddress()}
                hint={m.siteRedirectAddressHint()}
                dir="ltr"
                maxLength={2048}
                autoComplete="off"
                value={draft.toUrl}
                onChange={(event) =>
                  setDraft({ ...draft, toUrl: event.target.value })
                }
                errors={shown && issues.target ? [issues.target] : undefined}
              />
            ) : null}
          </>
        ) : null}
      </SheetForm>
    </div>
  );
}
