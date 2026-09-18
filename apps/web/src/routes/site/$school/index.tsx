import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { NewsletterSections } from "~/components/communication/NewsletterDocument";
import { PostList } from "~/components/site/PostList";
import { siteMediaUrl, siteTagline } from "~/components/site/SiteShell";
import * as m from "~/i18n/messages";
import { publicSiteQuery } from "~/queries/site";

export const Route = createFileRoute("/site/$school/")({
  component: SiteHome,
});
function SiteHome() {
  const { school } = Route.useParams();
  const { lang } = Route.useSearch();
  const { data } = useSuspenseQuery(publicSiteQuery({ school, locale: lang }));
  const tagline = siteTagline(data.settings, data.locale);
  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-2xl bg-primary/10 px-6 py-12 text-center sm:px-12">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {data.home?.title ?? data.school.name}
        </h1>
        {(data.home?.summary || tagline) && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {data.home?.summary || tagline}
          </p>
        )}
      </section>
      {data.home ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <NewsletterSections
            document={data.home.document}
            assetUrl={siteMediaUrl(school)}
          />
        </div>
      ) : null}
      <section aria-labelledby="site-latest">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="site-latest"
            className="text-2xl font-semibold tracking-tight"
          >
            {m.siteLatestNews()}
          </h2>
          <ButtonLink
            variant="ghost"
            size="sm"
            to="/site/$school/blog"
            params={{ school }}
            search={{ lang: data.locale }}
          >
            {m.commonViewAll()}
            <ArrowUpRight className="size-4 rtl:-rotate-90" aria-hidden />
          </ButtonLink>
        </div>
        <PostList posts={data.posts} school={school} locale={data.locale} />
      </section>
    </div>
  );
}
