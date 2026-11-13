import type {
  BuiltTemplate,
  PageTemplate,
} from "@faridalms/domain/site-templates";

import { siteThemeFor } from "@faridalms/domain/site-brand";
import {
  buildTemplate,
  PAGE_TEMPLATE_IDS,
} from "@faridalms/domain/site-templates";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { TemplateGallery } from "~/components/site/studio/Gallery";
import { SiteStudio } from "~/components/site/studio/Studio";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { siteOverviewQuery, sitePageQuery } from "~/queries/site";
import { currentUserQuery } from "~/queries/user";
import siteCss from "~/styles/site.css?url";
import { requirePage } from "~/utils/page-access";

const PANELS = ["sections", "page", "styles", "frame"] as const;

export const Route = createFileRoute("/_app/_staff/site-page-editor")({
  staticData: { section: "/website", immersive: true },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    template: v.optional(v.picklist(PAGE_TEMPLATE_IDS)),
    panel: v.optional(v.picklist(PANELS)),
  }),
  loaderDeps: ({ search }) => ({ id: search.id, template: search.template }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "site:manage");
    const [overview] = await Promise.all([
      context.queryClient.ensureQueryData(siteOverviewQuery),
      deps.id
        ? context.queryClient.ensureQueryData(sitePageQuery(deps.id))
        : null,
    ]);
    // A template's sections take fresh random ids, so they are built here
    // once and the browser hydrates the page the server drew with them.
    return {
      built:
        deps.template && !deps.id
          ? buildTemplate(deps.template, overview.settings.primaryLocale)
          : null,
    };
  },
  gcTime: 0,
  head: () => ({
    meta: [{ title: m.siteBuilderTitle() }],
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  component: EditorPage,
});

interface ExistingStudioProps {
  id: string;
}

function ExistingStudio({ id }: ExistingStudioProps) {
  const { panel } = Route.useSearch();
  const existing = useSuspenseQuery(sitePageQuery(id)).data;
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  return (
    <SiteStudio
      key={existing.id}
      existing={existing}
      overview={overview}
      template={null}
      initialPanel={panel}
    />
  );
}

/** A new page starts from a template, each drawn in the site's own theme. */
function TemplateChooser() {
  const user = useCurrentUser();
  const navigate = Route.useNavigate();
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  const locale = overview.settings.primaryLocale;
  return (
    <div className="h-dvh overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <ButtonLink
          to="/website"
          variant="ghost"
          size="icon"
          className="max-md:size-10"
          aria-label={m.siteBackToWebsite()}
        >
          <ArrowLeft aria-hidden className="rtl:rotate-180" />
        </ButtonLink>
        <h1 className="text-base font-semibold">{m.siteChooseTemplate()}</h1>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6">
        <p className="max-w-2xl text-muted-foreground">
          {m.siteChooseTemplateHint()}
        </p>
        <TemplateGallery
          context={{
            school: user.school.slug,
            locale,
            theme: siteThemeFor(overview.settings.theme, overview.school.brand),
            fileUrl: (fileId) => `/files/${fileId}`,
            news: overview.news[locale],
            contact: overview.school.contact,
            editing: true,
          }}
          onPick={(template) =>
            void navigate({ search: { template }, replace: true })
          }
        />
      </div>
    </div>
  );
}

function EditorPage() {
  const { id, template, panel } = Route.useSearch();
  const { built } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  // A new page stays the same builder once its first save gives it an
  // address, so what is being typed is never interrupted.
  const [started, setStarted] = useState<{
    template: PageTemplate;
    built: BuiltTemplate;
    id: string | null;
  } | null>(null);
  const fresh = template && built ? { template, built } : (started ?? null);
  if (id && started?.id !== id) return <ExistingStudio id={id} />;
  if (!fresh) return <TemplateChooser />;
  return (
    <SiteStudio
      key={fresh.template}
      existing={null}
      overview={overview}
      template={fresh.built}
      initialPanel={panel ?? "page"}
      onCreated={(created) => {
        setStarted({ ...fresh, id: created });
        void navigate({
          search: { id: created },
          replace: true,
          ignoreBlocker: true,
        });
      }}
    />
  );
}
