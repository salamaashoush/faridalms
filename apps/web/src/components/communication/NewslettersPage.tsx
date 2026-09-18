import type { NewslettersQuery } from "@faridalms/domain/school-schema";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Newspaper, Plus } from "lucide-react";
import { useState } from "react";

import type { DataColumn } from "~/components/admin/DataTable";

import { DataTable } from "~/components/admin/DataTable";
import { NewsletterEditor } from "~/components/admin/SchoolEditors";
import { ButtonLink } from "~/components/app/ButtonLink";
import { PageHeader, Value } from "~/components/app/primitives";
import { Button, buttonVariants } from "~/components/ui/button";
import { usePermission } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { newslettersQuery } from "~/queries/school";
import { formatDate } from "~/utils/datetime";

interface Newsletter {
  id: string;
  title: string;
  summary: string | null;
  publishedOn: string;
  url: string | null;
  hasDocument: boolean;
}
const columns: DataColumn<Newsletter, NewslettersQuery["sort"]>[] = [
  {
    id: "title",
    label: m.newslettersTitle,
    sort: "title",
    render: (row) => (
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Newspaper className="size-5" aria-hidden />
        </span>
        <span className="font-medium">{row.title}</span>
      </div>
    ),
  },
  {
    id: "summary",
    label: m.newsletterSummary,
    render: (row) => (
      <span className="line-clamp-2 max-w-md text-sm text-muted-foreground">
        <Value>{row.summary}</Value>
      </span>
    ),
  },
  {
    id: "date",
    label: m.newslettersPublished,
    sort: "date",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {formatDate(row.publishedOn)}
      </span>
    ),
  },
];
function NewsletterLink({ row }: { row: Newsletter }) {
  if (row.hasDocument || !row.url)
    return (
      <ButtonLink
        variant="ghost"
        size="sm"
        to="/newsletters/$newsletterId"
        params={{ newsletterId: row.id }}
        aria-label={`${m.newslettersOpen()} ${row.title}`}
      >
        {m.newslettersOpen()}
      </ButtonLink>
    );
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <ExternalLink className="size-4" aria-hidden />
      {m.newslettersOpen()}
      <span className="sr-only"> {row.title}</span>
    </a>
  );
}
export function NewslettersPage({ search }: { search: NewslettersQuery }) {
  const navigate = useNavigate();
  const data = useSuspenseQuery(newslettersQuery(search)).data;
  const canManage = usePermission("announcements:manage");
  const [editing, setEditing] = useState(false);
  const patch = (change: Partial<NewslettersQuery>) => {
    void navigate({ to: ".", search: { ...search, ...change } });
  };
  return (
    <>
      <PageHeader
        title={m.newslettersTitle()}
        description={m.newslettersSubtitle()}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                variant="outline"
                to="/admin/newsletter-drafts"
                search={{ page: 1 }}
              >
                {m.newsletterDrafts()}
              </ButtonLink>
              <ButtonLink to="/admin/newsletter-editor" search={{}}>
                {m.newsletterDesignTitle()}
              </ButtonLink>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Plus aria-hidden />
                {m.newsletterPublish()}
              </Button>
            </div>
          ) : undefined
        }
      />
      <DataTable
        columns={columns}
        caption={m.newslettersTitle()}
        query={search.q}
        onQuery={(q) => patch({ q, page: 1 })}
        sort={search.sort}
        direction={search.dir}
        onSort={(sort) =>
          patch({
            sort,
            dir: search.sort === sort && search.dir === "asc" ? "desc" : "asc",
          })
        }
        {...data}
        onPage={(page) => patch({ page })}
        renderActions={(row) => <NewsletterLink row={row} />}
      />
      {editing ? (
        <NewsletterEditor
          today={data.today}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
