import type { BannerTone, SocialKind } from "@faridalms/domain/website";
import type { GridColumn } from "@faridalms/ui/system/data-grid";

import { BANNER_TONES, SOCIAL_KINDS } from "@faridalms/domain/website";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  SelectCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Fact } from "@faridalms/ui/system/record-page";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { siteOverviewQuery } from "~/queries/site";

import { LOCALE_NAME } from "~/components/content/languages";
import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { saveSiteSettings } from "~/server/site";
import { formatNumber, instantFromLocal, localInput } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Settings = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>["settings"];

const SOCIAL_LABEL: Record<SocialKind, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
};

const TONE_LABEL: Record<BannerTone, () => string> = {
  info: m.siteToneInfo,
  warning: m.siteToneWarning,
  danger: m.siteToneDanger,
};

interface Draft {
  live: boolean;
  bilingual: boolean;
  taglineEn: string;
  taglineAr: string;
  socialLinks: { kind: SocialKind; url: string }[];
  bannerEn: string;
  bannerAr: string;
  bannerTone: BannerTone;
  bannerUntil: string;
}

function draftOf(settings: Settings): Draft {
  return {
    live: settings.live,
    bilingual: settings.bilingual,
    taglineEn: settings.taglineEn,
    taglineAr: settings.taglineAr,
    socialLinks: settings.socialLinks,
    bannerEn: settings.bannerEn,
    bannerAr: settings.bannerAr,
    bannerTone: settings.bannerTone,
    bannerUntil: localInput(settings.bannerUntil),
  };
}

const GROUPS = {
  site: ["live", "bilingual", "taglineEn", "taglineAr"],
  social: ["socialLinks"],
  banner: ["bannerEn", "bannerAr", "bannerTone", "bannerUntil"],
} as const satisfies Record<string, readonly (keyof Draft)[]>;

type SocialLink = Draft["socialLinks"][number];

interface SocialGridOptions {
  links: SocialLink[];
  set: (index: number, change: Partial<SocialLink>) => void;
  remove: (index: number) => void;
}

// Built per render: headers read the request's locale.
function socialGrid({ links, set, remove }: SocialGridOptions) {
  const at = (link: SocialLink) => links.indexOf(link);
  const rowHeader = {
    header: m.siteSocialKind(),
    cell: (link: SocialLink) => (
      <SelectCell
        id={`site-social-${at(link)}-kind`}
        label={m.siteSocialKindOf({ number: formatNumber(at(link) + 1) })}
        value={link.kind}
        options={SOCIAL_KINDS.map((kind) => ({
          value: kind,
          label: SOCIAL_LABEL[kind],
        }))}
        onChange={(kind) => set(at(link), { kind })}
      />
    ),
  };
  const columns: GridColumn<SocialLink>[] = [
    {
      id: "url",
      header: m.siteSocialAddress(),
      fill: true,
      cell: (link) => (
        <TextCell
          id={`site-social-${at(link)}-url`}
          label={m.siteSocialUrl({ kind: SOCIAL_LABEL[link.kind] })}
          dir="ltr"
          placeholder="https://"
          value={link.url}
          onChange={(url) => set(at(link), { url })}
        />
      ),
    },
  ];
  const rowEnd = (link: SocialLink) => (
    <GridRemoveButton
      label={m.siteRemoveSocial({ kind: SOCIAL_LABEL[link.kind] })}
      onRemove={() => remove(at(link))}
    />
  );
  return { rowHeader, columns, rowEnd };
}

export interface SiteSettingsProps {
  settings: Settings;
}

/** The website as a whole: whether it is live, its languages, links and banner. */
export function SiteSettings({ settings }: SiteSettingsProps) {
  const queryClient = useQueryClient();
  const initial = draftOf(settings);
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState<keyof typeof GROUPS | null>(null);
  const focusLater = useFocusAfterRender();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const save = useMutation({
    mutationFn: () =>
      saveSiteSettings({
        data: {
          ...draft,
          theme: settings.theme,
          chrome: settings.chrome,
          expectedVersion: settings.version,
          socialLinks: draft.socialLinks.filter((link) => link.url.trim()),
          bannerUntil: instantFromLocal(draft.bannerUntil),
        },
      }),
  });
  const dirty = (group: keyof typeof GROUPS) => () =>
    GROUPS[group].some(
      (key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]),
    );
  const submit = (group: keyof typeof GROUPS) => async () => {
    try {
      await save.mutateAsync();
    } catch {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["site"] });
    setSaved(group);
    toast.success(m.siteSettingsSaved());
  };
  const error = save.error ? getMessageFromError(save.error) : null;
  const addLink = (
    <GridAddButton
      label={m.siteAddSocial()}
      disabled={draft.socialLinks.length >= 10}
      choices={SOCIAL_KINDS.map((kind) => ({
        value: kind,
        label: SOCIAL_LABEL[kind],
      }))}
      onAdd={(kind) => {
        const chosen = SOCIAL_KINDS.find((one) => one === kind);
        if (!chosen) return;
        const index = draft.socialLinks.length;
        set("socialLinks", [...draft.socialLinks, { kind: chosen, url: "" }]);
        focusLater(`site-social-${index}-url`);
      }}
    />
  );
  return (
    <SettingsPage>
      <SettingsSection
        title={m.siteSettingsSite()}
        description={m.siteSettingsSiteHint()}
        onSubmit={submit("site")}
        pending={save.isPending}
        error={error}
        saved={saved === "site"}
        isDirty={dirty("site")}
      >
        <CheckboxRow
          label={m.siteLive()}
          hint={m.siteLiveHint()}
          checked={draft.live}
          onChange={(live) => set("live", live)}
        />
        <div className="grid gap-2">
          <dl>
            <Fact label={m.sitePrimaryLocale()}>
              {LOCALE_NAME[settings.primaryLocale]()}
            </Fact>
          </dl>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.sitePrimaryLocaleHint()}
          </p>
          <div>
            <ButtonLink
              to="/settings"
              search={{ section: "school" }}
              variant="outline"
              size="sm"
              className="max-md:h-10"
            >
              {m.siteChangeInSchoolSettings()}
            </ButtonLink>
          </div>
        </div>
        <CheckboxRow
          label={m.siteBilingual()}
          hint={m.siteBilingualHint()}
          checked={draft.bilingual}
          onChange={(bilingual) => set("bilingual", bilingual)}
        />
        <TextField
          id="site-tagline-en"
          label={m.siteTaglineEn()}
          width="name"
          dir="ltr"
          lang="en"
          maxLength={200}
          value={draft.taglineEn}
          onChange={(event) => set("taglineEn", event.target.value)}
        />
        <TextField
          id="site-tagline-ar"
          label={m.siteTaglineAr()}
          width="name"
          dir="rtl"
          lang="ar"
          maxLength={200}
          value={draft.taglineAr}
          onChange={(event) => set("taglineAr", event.target.value)}
        />
      </SettingsSection>
      <SettingsSection
        title={m.siteSettingsSocial()}
        description={m.siteSettingsSocialHint()}
        onSubmit={submit("social")}
        pending={save.isPending}
        error={error}
        saved={saved === "social"}
        isDirty={dirty("social")}
      >
        {draft.socialLinks.length ? (
          <DataGrid<SocialLink>
            caption={m.siteSettingsSocial()}
            editing
            {...socialGrid({
              links: draft.socialLinks,
              set: (index, change) =>
                set(
                  "socialLinks",
                  draft.socialLinks.map((item, at) =>
                    at === index ? { ...item, ...change } : item,
                  ),
                ),
              remove: (index) =>
                set(
                  "socialLinks",
                  draft.socialLinks.filter((_, at) => at !== index),
                ),
            })}
            groups={[{ id: "links", title: "", rows: draft.socialLinks }]}
            rowKey={(link) => `link-${draft.socialLinks.indexOf(link)}`}
            footer={addLink}
          />
        ) : (
          <div>{addLink}</div>
        )}
      </SettingsSection>
      <SettingsSection
        title={m.siteSettingsBanner()}
        description={m.siteSettingsBannerHint()}
        onSubmit={submit("banner")}
        pending={save.isPending}
        error={error}
        saved={saved === "banner"}
        isDirty={dirty("banner")}
      >
        <TextField
          id="site-banner-en"
          label={m.siteBannerEn()}
          width="name"
          dir="ltr"
          lang="en"
          maxLength={300}
          value={draft.bannerEn}
          onChange={(event) => set("bannerEn", event.target.value)}
        />
        <TextField
          id="site-banner-ar"
          label={m.siteBannerAr()}
          width="name"
          dir="rtl"
          lang="ar"
          maxLength={300}
          value={draft.bannerAr}
          onChange={(event) => set("bannerAr", event.target.value)}
        />
        <SelectField
          id="site-banner-tone"
          label={m.siteBannerTone()}
          width="date"
          value={draft.bannerTone}
          options={BANNER_TONES.map((tone) => ({
            value: tone,
            label: TONE_LABEL[tone](),
          }))}
          onChange={(bannerTone) => set("bannerTone", bannerTone)}
        />
        <TextField
          id="site-banner-until"
          label={m.siteBannerUntil()}
          hint={m.siteBannerUntilHint()}
          type="datetime-local"
          width="reference"
          optional
          value={draft.bannerUntil}
          onChange={(event) => set("bannerUntil", event.target.value)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
