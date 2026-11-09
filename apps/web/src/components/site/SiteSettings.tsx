import type { BannerTone, SocialKind } from "@faridalms/domain/website";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import {
  BANNER_TONES,
  SOCIAL_KINDS,
  socialLinkSchema,
} from "@faridalms/domain/website";
import { Button } from "@faridalms/ui/button";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Fact } from "@faridalms/ui/system/record-page";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { siteOverviewQuery } from "~/queries/site";

import { LOCALE_NAME } from "~/components/content/languages";
import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { saveSiteSettings } from "~/server/site";
import { instantFromLocal, localInput } from "~/utils/datetime";
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
    bannerEn: settings.bannerEn,
    bannerAr: settings.bannerAr,
    bannerTone: settings.bannerTone,
    bannerUntil: localInput(settings.bannerUntil),
  };
}

const GROUPS = {
  site: ["live", "bilingual", "taglineEn", "taglineAr"],
  banner: ["bannerEn", "bannerAr", "bannerTone", "bannerUntil"],
} as const satisfies Record<string, readonly (keyof Draft)[]>;

/** The website's settings as saved, with one change: what a row's sheet saves. */
function savedSettings(
  settings: Settings,
  change: Pick<Settings, "socialLinks">,
) {
  const saved = draftOf(settings);
  return {
    ...saved,
    ...change,
    theme: settings.theme,
    chrome: settings.chrome,
    expectedVersion: settings.version,
    bannerUntil: instantFromLocal(saved.bannerUntil),
  };
}

type SocialLink = Settings["socialLinks"][number];

interface SocialRow extends SocialLink {
  id: string;
  index: number;
}

type SocialOpener = (row: SocialRow) => ReactNode;

// Built per render: headers read the request's locale.
function socialColumns(opener: SocialOpener): Column<SocialRow>[] {
  return [
    {
      id: "kind",
      header: m.siteSocialKind(),
      primary: true,
      cell: opener,
    },
    {
      id: "url",
      header: m.siteSocialAddress(),
      width: "wide",
      cell: (row) => (
        <bdi dir="ltr" className="break-all text-muted-foreground">
          {row.url}
        </bdi>
      ),
    },
  ];
}

function socialCard(opener: SocialOpener) {
  return {
    title: opener,
    fact: (row: SocialRow) => <bdi dir="ltr">{row.url}</bdi>,
  };
}

/** The address as kept, or why it cannot be. */
function urlProblem(url: string): string | null {
  const parsed = v.safeParse(socialLinkSchema.entries.url, url);
  if (parsed.success) return null;
  return url.trim() ? m.siteSocialUrlInvalid() : m.siteSocialUrlNeeded();
}

interface SocialSheetProps {
  settings: Settings;
  /** The link being changed, by its place in the list; none to add one. */
  index: number | null;
  open: boolean;
  onClose: () => void;
}

/** One link at the foot of the website: the network and its address. */
function SocialSheet({ settings, index, open, onClose }: SocialSheetProps) {
  const queryClient = useQueryClient();
  const link = index === null ? undefined : settings.socialLinks[index];
  const [kind, setKind] = useState<SocialKind>(link?.kind ?? "facebook");
  const [url, setUrl] = useState(link?.url ?? "");
  const [tried, setTried] = useState(false);
  const problem = tried ? urlProblem(url) : null;
  const save = useMutation({
    mutationFn: (socialLinks: SocialLink[]) =>
      saveSiteSettings({ data: savedSettings(settings, { socialLinks }) }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        link
          ? m.siteSocialEdit({ kind: SOCIAL_LABEL[link.kind] })
          : m.siteAddSocial()
      }
      submitLabel={link ? m.siteSocialSave() : m.siteAddSocial()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (urlProblem(url)) return;
        const next = { kind, url: url.trim() };
        try {
          await save.mutateAsync(
            index === null
              ? [...settings.socialLinks, next]
              : settings.socialLinks.map((one, at) =>
                  at === index ? next : one,
                ),
          );
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["site"] });
        toast.success(m.siteSettingsSaved());
        onClose();
      }}
    >
      <SelectField
        id="site-social-kind"
        label={m.siteSocialKind()}
        value={kind}
        options={SOCIAL_KINDS.map((value) => ({
          value,
          label: SOCIAL_LABEL[value],
        }))}
        onChange={setKind}
        width="name"
      />
      <TextField
        id="site-social-url"
        label={m.siteSocialAddress()}
        hint={m.siteSocialUrlHint()}
        type="url"
        dir="ltr"
        width="name"
        autoComplete="off"
        placeholder="https://"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        errors={problem ? [problem] : undefined}
      />
    </SheetForm>
  );
}

interface SocialLinksProps {
  settings: Settings;
}

/**
 * The links at the foot of every page, each opened and saved on its own;
 * removing one asks first.
 */
function SocialLinks({ settings }: SocialLinksProps) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{
    index: number | null;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (index: number | null) =>
    setSheet((current) => ({
      index,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const rows = settings.socialLinks.map((link, index) =>
    Object.assign({ id: `${link.kind}-${String(index)}`, index }, link),
  );
  const opener: SocialOpener = (row) => (
    <RowButton onClick={() => open(row.index)}>
      {SOCIAL_LABEL[row.kind]}
    </RowButton>
  );
  const add = (variant: "default" | "outline") =>
    settings.socialLinks.length < 10 ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => open(null)}
      >
        <Plus aria-hidden />
        {m.siteAddSocial()}
      </Button>
    ) : undefined;
  const rowActions = (row: SocialRow): RowAction[] => [
    { label: m.recordEdit(), icon: Pencil, onSelect: () => open(row.index) },
    {
      label: m.siteSocialRemove(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.siteRemoveSocialTitle({ kind: SOCIAL_LABEL[row.kind] }),
        body: m.siteRemoveSocialBody(),
        label: m.siteSocialRemove(),
      },
      onSelect: async () => {
        await saveSiteSettings({
          data: savedSettings(settings, {
            socialLinks: settings.socialLinks.filter(
              (_, at) => at !== row.index,
            ),
          }),
        });
        await queryClient.invalidateQueries({ queryKey: ["site"] });
        toast.success(m.siteSettingsSaved());
      },
    },
  ];
  return (
    <SettingsSection
      title={m.siteSettingsSocial()}
      description={m.siteSettingsSocialHint()}
    >
      <DataTable
        caption={m.siteSettingsSocial()}
        rows={rows}
        columns={socialColumns(opener)}
        rowLabel={(row) => SOCIAL_LABEL[row.kind]}
        rowActions={rowActions}
        actions={add("outline")}
        card={socialCard(opener)}
        empty={{ title: m.siteSocialNone(), action: add("outline") }}
      />
      {sheet ? (
        <SocialSheet
          key={sheet.key}
          settings={settings}
          index={sheet.index}
          open={sheet.open}
          onClose={() =>
            setSheet((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </SettingsSection>
  );
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
          socialLinks: settings.socialLinks,
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
      <SocialLinks settings={settings} />
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
