import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { SchoolPage } from "@faridalms/domain/site-starters";
import type { SiteModules, StarterId } from "@faridalms/domain/site-templates";

import {
  buildTemplate,
  pageFits,
  STARTER_IDS,
  STARTERS,
} from "@faridalms/domain/site-templates";
import { resolveTheme, THEMES } from "@faridalms/domain/site-theme";
import { Button } from "@faridalms/ui/button";
import { Check, Eye } from "lucide-react";
import { useMemo, useState } from "react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatList, formatNumber } from "~/utils/datetime";

import type { NewsItem, SiteContact } from "./render/parts";

import { PageSections } from "./render/page";
import { StarterPreview } from "./StarterPreview";
import { StarterReview } from "./StarterReview";
import { Viewport } from "./studio/Canvas";
import { STARTER_HINT, STARTER_LABEL, THEME_LABEL } from "./studio/labels";

interface StarterCardProps {
  starter: StarterId;
  modules: SiteModules;
  locale: SiteLocale;
  school: string;
  news: NewsItem[];
  contact: SiteContact;
  onPreview: () => void;
  onUse: () => void;
}

function StarterCard({
  starter,
  modules,
  locale,
  school,
  news,
  contact,
  onPreview,
  onUse,
}: StarterCardProps) {
  const plan = STARTERS[starter];
  const home = plan.pages.find((page) => page.home) ?? plan.pages[0];
  const sections = useMemo(
    () => (home ? buildTemplate(home.template, locale, modules).content : []),
    [home, locale, modules],
  );
  const kept = plan.pages.filter((page) => pageFits(page, modules));
  const left = plan.pages.filter((page) => !pageFits(page, modules));
  const titleAt = getLocale() === "ar" ? 1 : 0;
  const theme = resolveTheme({ id: plan.theme, palette: {}, fonts: {} });
  return (
    <li className="grid content-start overflow-hidden rounded-xl border bg-card shadow-xs">
      <div
        aria-hidden
        inert
        className="pointer-events-none h-64 overflow-hidden border-b bg-white"
      >
        <Viewport width={1280} theme={theme} locale={locale}>
          <PageSections
            sections={sections.map((section) => ({ section, locale }))}
            title=""
            context={{
              school,
              locale,
              theme,
              fileUrl: () => null,
              news,
              contact,
              editing: true,
            }}
          />
        </Viewport>
      </div>
      <div className="grid gap-3 p-4">
        <div className="grid gap-1">
          <h3 className="font-semibold">{STARTER_LABEL[starter]()}</h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {STARTER_HINT[starter]()}
          </p>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {m.siteStarterTheme({ theme: THEME_LABEL[plan.theme]() })} ·{" "}
          {m.siteStarterPages({
            count: kept.length,
            value: formatNumber(kept.length),
          })}
        </p>
        {left.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {m.siteStarterWithout({
              count: left.length,
              pages: formatList(left.map((page) => page.title[titleAt])),
            })}
          </p>
        ) : null}
        <div className="flex gap-1">
          {Object.entries(THEMES[plan.theme].palette).map(([role, colour]) => (
            <span
              key={role}
              className="size-4 rounded-full border border-black/10"
              style={{ background: colour }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            aria-label={m.siteStarterPreview({
              starter: STARTER_LABEL[starter](),
            })}
            onClick={onPreview}
          >
            <Eye aria-hidden />
            {m.sitePreviewStarter()}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={onUse}
          >
            <Check aria-hidden />
            {m.siteUseStarter()}
          </Button>
        </div>
      </div>
    </li>
  );
}

export interface StartersProps {
  locale: SiteLocale;
  school: string;
  news: NewsItem[];
  contact: SiteContact;
  /** The school's own pages, which a starter's pages may meet. */
  pages: SchoolPage[];
  schoolName: { en: string; ar: string | null };
}

/**
 * Whole sites to start from: each a theme and a set of pages with sample
 * words in both languages, built from the school's modules, those whose
 * pages all fit it first. Each can be previewed whole before it is used,
 * and using one shows first which of its pages are new and which meet a
 * page the school has, to keep or replace.
 */
export function Starters({
  locale,
  school,
  news,
  contact,
  pages,
  schoolName,
}: StartersProps) {
  const { modules } = useCurrentUser();
  const [previewing, setPreviewing] = useState<StarterId | null>(null);
  const [using, setUsing] = useState<StarterId | null>(null);
  const fitting = (starter: StarterId) =>
    STARTERS[starter].pages.every((page) => pageFits(page, modules));
  const order = [
    ...STARTER_IDS.filter(fitting),
    ...STARTER_IDS.filter((starter) => !fitting(starter)),
  ];
  return (
    <div className="grid gap-4">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {order.map((starter) => (
          <StarterCard
            key={starter}
            starter={starter}
            modules={modules}
            locale={locale}
            school={school}
            news={news}
            contact={contact}
            onPreview={() => setPreviewing(starter)}
            onUse={() => setUsing(starter)}
          />
        ))}
      </ul>
      <StarterPreview
        starter={previewing}
        modules={modules}
        primary={locale}
        school={school}
        schoolName={schoolName}
        news={news}
        contact={contact}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
        onUse={setUsing}
      />
      <StarterReview
        starter={using}
        modules={modules}
        pages={pages}
        onOpenChange={(open) => {
          if (!open) setUsing(null);
        }}
      />
    </div>
  );
}
