import { emptyContent } from "@faridalms/domain/content-conversion";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { SitePostWorkspace } from "~/components/site/SitePostWorkspace";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { siteCategoriesQuery, sitePostQuery } from "~/queries/site";

export const Route = createFileRoute("/_app/admin/site-post-editor")({
  staticData: { breadcrumb: m.sitePostWrite },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(siteCategoriesQuery);
    if (deps.id)
      await context.queryClient.ensureQueryData(sitePostQuery(deps.id));
  },
  component: EditorPage,
});
function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void navigate({ to: "/admin/site", search: { tab: "posts" } });
  };
  const saved = (postId: string) => {
    void navigate({
      to: "/admin/site-post-editor",
      search: { id: postId },
      replace: true,
    });
  };
  return id ? (
    <Existing key={id} id={id} onClose={close} onSaved={saved} />
  ) : (
    <NewPost onClose={close} onSaved={saved} />
  );
}
function useCategories() {
  const { data } = useSuspenseQuery(siteCategoriesQuery);
  return data.map((category) => ({ id: category.id, name: category.name }));
}
function Existing({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(sitePostQuery(id));
  const categories = useCategories();
  return (
    <SitePostWorkspace
      initial={{
        id: data.id,
        expectedRevision: data.revision,
        slug: data.slug,
        locale: data.locale,
        title: data.title,
        summary: data.summary,
        categoryId: data.categoryId,
        coverFileId: data.coverFileId,
        document: data.document,
      }}
      cover={data.cover}
      status={data.status}
      publishAt={data.publishAt}
      categories={categories}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
function NewPost({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const categories = useCategories();
  return (
    <SitePostWorkspace
      initial={{
        id,
        expectedRevision: 0,
        slug: "",
        locale: getLocale(),
        title: "",
        summary: "",
        categoryId: null,
        coverFileId: null,
        document: emptyContent(),
      }}
      cover={null}
      status="draft"
      publishAt={null}
      categories={categories}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
