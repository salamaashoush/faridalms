import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Value } from "@faridalms/ui/system/value";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { siteOverviewQuery } from "~/queries/site";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { removeSiteCategory, saveSiteCategory } from "~/server/site";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Category = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>["categories"][number];

interface Draft {
  id: string;
  expectedVersion: number;
  slug: string;
  nameEn: string;
  nameAr: string;
}

const blank: Draft = {
  id: "",
  expectedVersion: 0,
  slug: "",
  nameEn: "",
  nameAr: "",
};
const nameOf = (row: Category) =>
  inLocale(row.nameEn || null, row.nameAr || null);

function Name({ row }: { row: Category }) {
  return <span className="font-medium">{nameOf(row)}</span>;
}

function columns(): Column<Category>[] {
  return [
    {
      id: "name",
      header: m.siteCategoryName(),
      primary: true,
      cell: (row) => <Name row={row} />,
    },
    {
      id: "slug",
      header: m.siteAddress(),
      cell: (row) => (
        <span dir="ltr" className="text-sm text-muted-foreground">
          {`/news?category=${row.slug}`}
        </span>
      ),
    },
    {
      id: "posts",
      header: m.sitePostCount(),
      cell: (row) => <Value>{formatNumber(row.posts)}</Value>,
    },
  ];
}

const categoryCard = {
  title: (row: Category) => <Name row={row} />,
  fact: (row: Category) => formatNumber(row.posts),
};

/** How news is grouped; visitors filter the news page by these. */
export function SiteCategories({ categories }: { categories: Category[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shown, setShown] = useState(false);
  const save = useMutation({
    mutationFn: (value: Draft) => saveSiteCategory({ data: value }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["site"] });
  const open = (value: Draft) => {
    save.reset();
    setShown(false);
    setDraft(value);
  };
  const issues = draft
    ? {
        slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug)
          ? null
          : m.siteSlugNeeded(),
        name:
          draft.nameEn.trim() || draft.nameAr.trim()
            ? null
            : m.siteNameNeeded(),
      }
    : { slug: null, name: null };
  const rowActions = (row: Category): RowAction[] => [
    {
      label: m.siteEditCategory(),
      icon: Pencil,
      inline: true,
      onSelect: () =>
        open({
          id: row.id,
          expectedVersion: row.version,
          slug: row.slug,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
        }),
    },
    {
      label: m.siteRemoveCategory(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.siteRemoveCategoryTitle({ name: nameOf(row) }),
        body: m.siteRemoveCategoryBody(),
        label: m.siteRemoveCategory(),
      },
      onSelect: async () => {
        try {
          await removeSiteCategory({ data: { id: row.id } });
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
      {m.siteNewCategory()}
    </Button>
  );
  return (
    <div className="grid gap-4">
      {categories.length > 0 ? (
        <div className="flex justify-end">{create}</div>
      ) : null}
      <DataTable
        caption={m.siteCategoriesCaption()}
        rows={categories}
        columns={columns()}
        rowLabel={nameOf}
        rowActions={rowActions}
        card={categoryCard}
        empty={{
          icon: Tags,
          title: m.siteNoCategories(),
          description: m.siteNoCategoriesBody(),
          action: create,
        }}
      />
      <SheetForm
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next) setDraft(null);
        }}
        title={draft?.id ? m.siteEditCategory() : m.siteNewCategory()}
        pending={save.isPending}
        error={save.error ? getMessageFromError(save.error) : null}
        onSubmit={async () => {
          setShown(true);
          if (!draft || issues.slug || issues.name) return;
          try {
            await save.mutateAsync(draft);
          } catch {
            return;
          }
          await refresh();
          toast.success(m.siteCategorySaved());
          setDraft(null);
        }}
      >
        {draft ? (
          <>
            <TextField
              id="category-name-en"
              label={m.siteNameEn()}
              dir="ltr"
              lang="en"
              maxLength={100}
              value={draft.nameEn}
              onChange={(event) =>
                setDraft({ ...draft, nameEn: event.target.value })
              }
              errors={shown && issues.name ? [issues.name] : undefined}
            />
            <TextField
              id="category-name-ar"
              label={m.siteNameAr()}
              dir="rtl"
              lang="ar"
              maxLength={100}
              value={draft.nameAr}
              onChange={(event) =>
                setDraft({ ...draft, nameAr: event.target.value })
              }
            />
            <TextField
              id="category-slug"
              label={m.siteSlug()}
              hint={m.siteSlugHint()}
              dir="ltr"
              maxLength={80}
              autoComplete="off"
              value={draft.slug}
              onChange={(event) =>
                setDraft({ ...draft, slug: event.target.value.toLowerCase() })
              }
              errors={shown && issues.slug ? [issues.slug] : undefined}
            />
          </>
        ) : null}
      </SheetForm>
    </div>
  );
}
