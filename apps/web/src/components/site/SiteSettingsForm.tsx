import type { FileSummary } from "@faridalms/database/repositories/files";
import type { SaveSiteSettingsInput, SocialLink } from "@faridalms/domain/site";

import {
  SITE_LOCALES,
  SITE_MEDIA_BYTES,
  saveSiteSettingsSchema,
} from "@faridalms/domain/site";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { getSiteSettings } from "~/server/site";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ButtonLink } from "~/components/app/ButtonLink";
import { SectionCard, Value } from "~/components/app/primitives";
import { FileUploader } from "~/components/assignments/FileUploader";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { saveSiteSettings } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

type Settings = Awaited<ReturnType<typeof getSiteSettings>>;

export function SiteSettingsForm({ data }: { data: Settings }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveSiteSettings);
  const [revision, setRevision] = useState(data.settings.revision);
  const [logo, setLogo] = useState<FileSummary[]>(
    data.settings.logo ? [data.settings.logo] : [],
  );
  const [links, setLinks] = useState<(SocialLink & { key: string })[]>(() =>
    data.settings.socialLinks.map((link) => ({
      ...link,
      key: crypto.randomUUID(),
    })),
  );
  const [failure, setFailure] = useState<string>();
  const mutation = useMutation({
    mutationFn: (input: SaveSiteSettingsInput) => save({ data: input }),
  });
  const form = useForm({
    defaultValues: {
      tagline: data.settings.tagline,
      taglineAr: data.settings.taglineAr,
      primaryColor: data.settings.primaryColor,
      contactEmail: data.settings.contactEmail,
      contactPhone: data.settings.contactPhone,
      address: data.settings.address,
      mapUrl: data.settings.mapUrl,
      defaultLocale: data.settings.defaultLocale,
      isPublished: data.settings.isPublished,
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: v.object({
        tagline: saveSiteSettingsSchema.entries.tagline,
        taglineAr: saveSiteSettingsSchema.entries.taglineAr,
        primaryColor: saveSiteSettingsSchema.entries.primaryColor,
        contactEmail: saveSiteSettingsSchema.entries.contactEmail,
        contactPhone: saveSiteSettingsSchema.entries.contactPhone,
        address: saveSiteSettingsSchema.entries.address,
        mapUrl: saveSiteSettingsSchema.entries.mapUrl,
        defaultLocale: saveSiteSettingsSchema.entries.defaultLocale,
        isPublished: saveSiteSettingsSchema.entries.isPublished,
      }),
    },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      const parsed = v.safeParse(saveSiteSettingsSchema, {
        ...value,
        expectedRevision: revision,
        logoFileId: logo[0]?.id ?? null,
        socialLinks: links.map(({ label, url }) => ({ label, url })),
      });
      if (!parsed.success) {
        setFailure(m.siteSocialInvalid());
        return;
      }
      try {
        const saved = await mutation.mutateAsync(parsed.output);
        setRevision(saved.revision);
        form.reset(value);
        await queryClient.invalidateQueries({ queryKey: ["site"] });
        await queryClient.invalidateQueries({ queryKey: ["public-site"] });
        toast.success(m.managementSaved());
      } catch (error) {
        setFailure(getMessageFromError(error));
      }
    },
  });
  const pending = mutation.isPending;
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SectionCard
        title={m.siteIdentity()}
        description={m.siteIdentityHint()}
        actions={
          <ButtonLink
            variant="outline"
            size="sm"
            to="/site/$school"
            params={{ school: data.school.slug }}
            search={{}}
          >
            <ExternalLink aria-hidden />
            {m.siteViewSite()}
          </ButtonLink>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="tagline">
            {(field) => (
              <ManagementInput
                label={m.siteTagline()}
                value={field.state.value}
                maxLength={255}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={pending}
              />
            )}
          </form.Field>
          <form.Field name="taglineAr">
            {(field) => (
              <ManagementInput
                label={m.siteTaglineAr()}
                dir="rtl"
                value={field.state.value}
                maxLength={255}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={pending}
              />
            )}
          </form.Field>
          <form.Field name="primaryColor">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="site-color">
                  {m.sitePrimaryColor()}
                </FieldLabel>
                <div className="flex items-center gap-3">
                  <input
                    id="site-color"
                    type="color"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    disabled={pending}
                    className="size-10 cursor-pointer rounded-md border bg-transparent p-1"
                  />
                  <Input
                    aria-label={m.sitePrimaryColorHex()}
                    value={field.state.value}
                    dir="ltr"
                    maxLength={7}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    disabled={pending}
                    className="h-10 w-32"
                  />
                </div>
                <FieldDescription>{m.sitePrimaryColorHint()}</FieldDescription>
              </Field>
            )}
          </form.Field>
          <form.Field name="defaultLocale">
            {(field) => (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">
                  {m.siteDefaultLocale()}
                </legend>
                <div className="flex gap-2">
                  {SITE_LOCALES.map((locale) => (
                    <Button
                      key={locale}
                      type="button"
                      variant={
                        field.state.value === locale ? "secondary" : "outline"
                      }
                      aria-pressed={field.state.value === locale}
                      onClick={() => field.handleChange(locale)}
                      disabled={pending}
                    >
                      {locale === "en"
                        ? m.newsletterEnglish()
                        : m.newsletterArabic()}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
          </form.Field>
        </div>
        <div className="mt-5">
          <FileUploader
            label={m.siteLogo()}
            description={m.siteLogoHint()}
            purpose="site_media"
            value={logo}
            onChange={(update) =>
              setLogo((current) => update(current).slice(-1))
            }
            maxFiles={1}
            maxBytes={SITE_MEDIA_BYTES}
            disabled={pending}
          />
        </div>
        <div className="mt-5">
          <form.Field name="isPublished">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="site-published"
                  checked={field.state.value}
                  onCheckedChange={(next) => field.handleChange(next)}
                  disabled={pending}
                />
                <FieldContent>
                  <FieldLabel htmlFor="site-published">
                    {m.sitePublished()}
                  </FieldLabel>
                  <FieldDescription>{m.sitePublishedHint()}</FieldDescription>
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>
        <dl className="mt-5 text-sm text-muted-foreground">
          <dt className="font-medium">{m.sitePublicDomain()}</dt>
          <dd>
            <Value>{data.school.publicDomain}</Value>
          </dd>
        </dl>
      </SectionCard>

      <SectionCard title={m.siteContact()}>
        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="contactEmail">
            {(field) => (
              <ManagementInput
                label={m.siteContactEmail()}
                type="email"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={pending}
              />
            )}
          </form.Field>
          <form.Field name="contactPhone">
            {(field) => (
              <ManagementInput
                label={m.siteContactPhone()}
                type="tel"
                dir="ltr"
                value={field.state.value}
                maxLength={40}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={pending}
              />
            )}
          </form.Field>
          <form.Field name="address">
            {(field) => (
              <ManagementInput
                label={m.siteAddress()}
                value={field.state.value}
                maxLength={500}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={pending}
              />
            )}
          </form.Field>
          <form.Field name="mapUrl">
            {(field) => (
              <ManagementInput
                label={m.siteMapUrl()}
                type="url"
                dir="ltr"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={pending}
              />
            )}
          </form.Field>
        </div>
      </SectionCard>

      <SectionCard
        title={m.siteSocialLinks()}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || links.length >= 8}
            onClick={() =>
              setLinks((current) => [
                ...current,
                { key: crypto.randomUUID(), label: "", url: "" },
              ])
            }
          >
            <Plus aria-hidden />
            {m.siteAddSocial()}
          </Button>
        }
      >
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.siteNoSocial()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {links.map((link, index) => (
              <li
                key={link.key}
                className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
              >
                <ManagementInput
                  label={m.siteSocialLabel()}
                  value={link.label}
                  maxLength={40}
                  disabled={pending}
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <ManagementInput
                  label={m.siteSocialUrl()}
                  type="url"
                  dir="ltr"
                  value={link.url}
                  disabled={pending}
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, url: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={m.siteRemove()}
                  disabled={pending}
                  onClick={() =>
                    setLinks((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? m.teachSaving() : m.managementSave()}
        </Button>
      </div>
    </form>
  );
}
