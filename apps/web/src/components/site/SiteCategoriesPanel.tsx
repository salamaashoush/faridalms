import type { SaveSiteCategoryInput } from "@faridalms/domain/site";

import { saveSiteCategorySchema } from "@faridalms/domain/site";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  ManagementDialog,
  ManagementInput,
} from "~/components/admin/ManagementDialog";
import { EmptyState, SectionCard } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { siteCategoriesQuery } from "~/queries/site";
import { saveSiteCategory } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

type Category = SaveSiteCategoryInput;

export function SiteCategoriesPanel() {
  const { data } = useSuspenseQuery(siteCategoriesQuery);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  return (
    <SectionCard
      title={m.siteTabCategories()}
      description={m.siteCategoriesHint()}
      actions={
        <Button type="button" size="sm" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {m.siteAddCategory()}
        </Button>
      }
    >
      {data.length === 0 ? (
        <EmptyState icon={Tags} title={m.siteNoCategories()} />
      ) : (
        <ul className="divide-y">
          {data.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {category.name}
                  {category.nameAr ? (
                    <span className="ms-2 text-muted-foreground" dir="rtl">
                      {category.nameAr}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  /{category.slug}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(category)}
              >
                <Pencil aria-hidden />
                {m.siteEditCategory()}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <CategoryDialog
          key={editing === "new" ? "new" : editing.id}
          initial={
            editing === "new"
              ? {
                  id: crypto.randomUUID(),
                  slug: "",
                  name: "",
                  nameAr: "",
                  sortOrder: data.length,
                }
              : editing
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function CategoryDialog({
  initial,
  onClose,
}: {
  initial: Category;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveSiteCategory);
  const [failure, setFailure] = useState<string>();
  const mutation = useMutation({
    mutationFn: (input: Category) => save({ data: input }),
  });
  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveSiteCategorySchema },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      try {
        await mutation.mutateAsync(v.parse(saveSiteCategorySchema, value));
        await queryClient.invalidateQueries({ queryKey: ["site"] });
        await queryClient.invalidateQueries({ queryKey: ["public-site"] });
        toast.success(m.managementSaved());
        onClose();
      } catch (error) {
        setFailure(getMessageFromError(error));
      }
    },
  });
  return (
    <ManagementDialog
      title={m.siteCategoryDialog()}
      description={m.siteCategoriesHint()}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      pending={mutation.isPending}
    >
      <form.Field name="name">
        {(field) => (
          <ManagementInput
            label={m.siteCategoryName()}
            value={field.state.value}
            maxLength={80}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="nameAr">
        {(field) => (
          <ManagementInput
            label={m.siteCategoryNameAr()}
            dir="rtl"
            value={field.state.value}
            maxLength={80}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="slug">
        {(field) => (
          <ManagementInput
            label={m.siteSlug()}
            dir="ltr"
            value={field.state.value}
            maxLength={80}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="sortOrder">
        {(field) => (
          <ManagementInput
            label={m.siteCategorySortOrder()}
            type="number"
            min={0}
            max={999}
            value={String(field.state.value)}
            onChange={(event) => field.handleChange(Number(event.target.value))}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
    </ManagementDialog>
  );
}
