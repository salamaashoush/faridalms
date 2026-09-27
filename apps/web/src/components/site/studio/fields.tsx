import type { ContentDocument } from "@faridalms/domain/content";
import type {
  BADGES,
  Field,
  IconId,
  SiteEmbed,
  SiteImage,
  SiteLink,
  SiteLocale,
  SiteMedia,
} from "@faridalms/domain/site-sections";
import type { EditorMedia } from "@faridalms/editor";
import type { MouseEvent, ReactNode } from "react";

import { Popover } from "@base-ui/react/popover";
import { embedProviderNames, parseEmbedUrl } from "@faridalms/domain/embed";
import { ICONS, newItem } from "@faridalms/domain/site-sections";
import {
  ArrowDown,
  ArrowUp,
  Captions,
  Film,
  ImageIcon,
  ImagePlus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

import { SiteIcon } from "../render/parts";
import { Disclosure, Segmented, StudioField } from "./controls";
import {
  AUDIENCE_LABEL,
  FIELD_LABEL,
  HEIGHT_LABEL,
  ICON_LABEL,
} from "./labels";

export interface FieldContext {
  /** The language whose words are being edited. */
  locale: SiteLocale;
  /** Only words change in this language; pictures, links and layout follow the original. */
  wordsOnly: boolean;
  pages: { href: string; title: string }[];
  media: EditorMedia;
}

const BADGE_NAME: Record<(typeof BADGES)[number], string> = {
  none: "",
  isi: "ISI",
  khda: "KHDA",
  adek: "ADEK",
  ofsted: "Ofsted",
  bso: "BSO",
  cis: "CIS",
  neasc: "NEASC",
  ib: "IB",
  cognia: "Cognia",
};

const dirOf = (locale: SiteLocale) => (locale === "ar" ? "rtl" : "ltr");
const fileUrl = (fileId: string) => `/files/${fileId}`;

export const labelOf = (name: string) => FIELD_LABEL[name]?.() ?? name;

export function useUpload(media: EditorMedia) {
  const [busy, setBusy] = useState(false);
  const upload = async (
    file: File | undefined,
    done: (fileId: string) => void,
  ) => {
    if (!file) return;
    setBusy(true);
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type === "text/vtt" || file.name.endsWith(".vtt")
        ? "captions"
        : "media";
    try {
      done((await media.upload(file, kind)).fileId);
    } catch {
      toast.error(m.siteUploadFailed());
    } finally {
      setBusy(false);
    }
  };
  return { busy, upload };
}

export function FilePick({
  accept,
  label,
  busy,
  onFile,
  icon,
}: {
  accept: string[];
  label: string;
  busy: boolean;
  onFile: (file: File | undefined) => void;
  icon?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-10"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {icon ?? <ImagePlus aria-hidden />}
        {label}
      </Button>
    </>
  );
}

function TextControl({
  id,
  label,
  value,
  max,
  multiline,
  locale,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  locale: SiteLocale;
  onChange: (value: string) => void;
}) {
  const near = value.length > max * 0.8;
  const props = { id, value, maxLength: max, lang: locale, dir: dirOf(locale) };
  return (
    <StudioField
      id={id}
      label={label}
      counter={
        near ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {m.siteCharactersLeft({ count: max - value.length })}
          </span>
        ) : null
      }
    >
      {multiline ? (
        <Textarea
          {...props}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          {...props}
          className="max-md:h-10"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </StudioField>
  );
}

function AltText({
  id,
  value,
  locale,
  onChange,
}: {
  id: string;
  value: string;
  locale: SiteLocale;
  onChange: (alt: string) => void;
}) {
  return (
    <StudioField id={id} label={m.siteAltText()} hint={m.siteAltHint()}>
      <Input
        id={id}
        value={value}
        maxLength={300}
        lang={locale}
        dir={dirOf(locale)}
        className="max-md:h-10"
        onChange={(event) => onChange(event.target.value)}
      />
    </StudioField>
  );
}

function Thumb({
  fileId,
  video = false,
}: {
  fileId: string | null;
  video?: boolean;
}) {
  return (
    <div className="grid aspect-[16/10] w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
      {fileId && !video ? (
        <img src={fileUrl(fileId)} alt="" className="size-full object-cover" />
      ) : video && fileId ? (
        <Film aria-hidden className="size-6 text-muted-foreground" />
      ) : (
        <ImageIcon aria-hidden className="size-6 text-muted-foreground" />
      )}
    </div>
  );
}

function ImageControl({
  id,
  label,
  value,
  context,
  onChange,
}: {
  id: string;
  label: string;
  value: SiteImage;
  context: FieldContext;
  onChange: (value: SiteImage) => void;
}) {
  const { busy, upload } = useUpload(context.media);
  return (
    <StudioField label={label}>
      <div className="flex items-center gap-3">
        <Thumb fileId={value.fileId} />
        {context.wordsOnly ? null : (
          <div className="flex flex-wrap gap-1.5">
            <FilePick
              accept={context.media.accept.image}
              label={value.fileId ? m.siteReplace() : m.siteUpload()}
              busy={busy}
              onFile={(file) =>
                void upload(file, (fileId) => onChange({ ...value, fileId }))
              }
            />
            {value.fileId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.siteRemovePicture()}
                onClick={() => onChange({ fileId: null, alt: "" })}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {value.fileId ? (
        <AltText
          id={`${id}-alt`}
          value={value.alt}
          locale={context.locale}
          onChange={(alt) => onChange({ ...value, alt })}
        />
      ) : null}
    </StudioField>
  );
}

function MediaControl({
  id,
  label,
  value,
  context,
  onChange,
}: {
  id: string;
  label: string;
  value: SiteMedia;
  context: FieldContext;
  onChange: (value: SiteMedia) => void;
}) {
  const { busy, upload } = useUpload(context.media);
  const video = value.kind === "video";
  return (
    <StudioField label={label}>
      {context.wordsOnly ? null : (
        <Segmented
          label={label}
          value={value.kind}
          options={[
            { value: "image", label: m.sitePicture() },
            { value: "video", label: m.siteVideo() },
          ]}
          onChange={(kind) =>
            onChange({
              kind,
              fileId: null,
              alt: "",
              posterFileId: null,
              captionsFileId: null,
            })
          }
        />
      )}
      <div className="flex items-center gap-3">
        <Thumb
          fileId={video ? (value.posterFileId ?? value.fileId) : value.fileId}
          video={video && !value.posterFileId}
        />
        {context.wordsOnly ? null : (
          <div className="flex flex-wrap gap-1.5">
            <FilePick
              accept={
                video
                  ? context.media.accept.media.filter((type) =>
                      type.startsWith("video/"),
                    )
                  : context.media.accept.image
              }
              label={value.fileId ? m.siteReplace() : m.siteUpload()}
              busy={busy}
              icon={video ? <Film aria-hidden /> : undefined}
              onFile={(file) =>
                void upload(file, (fileId) => onChange({ ...value, fileId }))
              }
            />
            {value.fileId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.siteRemovePicture()}
                onClick={() =>
                  onChange({
                    ...value,
                    fileId: null,
                    posterFileId: null,
                    captionsFileId: null,
                    alt: "",
                  })
                }
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {video && value.fileId && !context.wordsOnly ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilePick
              accept={context.media.accept.image}
              label={
                value.posterFileId ? m.siteReplacePoster() : m.siteAddPoster()
              }
              busy={busy}
              onFile={(file) =>
                void upload(file, (posterFileId) =>
                  onChange({ ...value, posterFileId }),
                )
              }
            />
            <FilePick
              accept={context.media.accept.captions}
              label={
                value.captionsFileId
                  ? m.siteReplaceCaptions()
                  : m.siteAddCaptions()
              }
              busy={busy}
              icon={<Captions aria-hidden />}
              onFile={(file) =>
                void upload(file, (captionsFileId) =>
                  onChange({ ...value, captionsFileId }),
                )
              }
            />
          </div>
          <p
            className={cn(
              "text-[13px] leading-[18px]",
              value.captionsFileId
                ? "text-muted-foreground"
                : "text-destructive",
            )}
          >
            {value.captionsFileId
              ? m.siteCaptionsReady()
              : m.siteCaptionsNeeded()}
          </p>
        </div>
      ) : null}
      {!video && value.fileId ? (
        <AltText
          id={`${id}-alt`}
          value={value.alt}
          locale={context.locale}
          onChange={(alt) => onChange({ ...value, alt })}
        />
      ) : null}
    </StudioField>
  );
}

function HrefInput({
  id,
  value,
  context,
  onChange,
  label,
}: {
  id: string;
  value: string;
  context: FieldContext;
  onChange: (value: string) => void;
  label?: string;
}) {
  const list = `${id}-pages`;
  return (
    <>
      <Input
        id={id}
        value={value}
        list={list}
        dir="ltr"
        placeholder={m.siteLinkPlaceholder()}
        aria-label={label}
        className="max-md:h-10"
        onChange={(event) => onChange(event.target.value.trim())}
      />
      <datalist id={list}>
        {context.pages.map((page) => (
          <option key={page.href} value={page.href}>
            {page.title}
          </option>
        ))}
      </datalist>
    </>
  );
}

function moved<T>(items: T[], index: number, by: -1 | 1): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(index + by, 0, item);
  return next;
}

function LinksControl({
  id,
  label,
  value,
  max,
  context,
  onChange,
}: {
  id: string;
  label: string;
  value: SiteLink[];
  max: number;
  context: FieldContext;
  onChange: (value: SiteLink[]) => void;
}) {
  const set = (index: number, change: Partial<SiteLink>) =>
    onChange(
      value.map((link, at) => (at === index ? { ...link, ...change } : link)),
    );
  return (
    <StudioField
      label={label}
      hint={context.wordsOnly ? undefined : m.siteButtonHint()}
    >
      <ul className="grid gap-2">
        {value.map((link, index) => (
          <li
            key={link.id}
            className="grid gap-2 rounded-lg border bg-card p-2.5"
          >
            <div className="flex items-center gap-1.5">
              <Input
                value={link.label}
                maxLength={60}
                lang={context.locale}
                dir={dirOf(context.locale)}
                aria-label={m.siteButtonWords({
                  number: formatNumber(index + 1),
                })}
                placeholder={m.siteButtonWordsPlaceholder()}
                className="max-md:h-10"
                onChange={(event) => set(index, { label: event.target.value })}
              />
              {context.wordsOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={m.siteRemoveItem({
                    item:
                      link.label ||
                      m.siteButtonWords({ number: formatNumber(index + 1) }),
                  })}
                  onClick={() =>
                    onChange(value.filter((_, at) => at !== index))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
            {context.wordsOnly ? null : (
              <HrefInput
                id={`${id}-${link.id}`}
                value={link.href}
                context={context}
                label={m.siteButtonTarget({ number: formatNumber(index + 1) })}
                onChange={(href) => set(index, { href })}
              />
            )}
          </li>
        ))}
      </ul>
      {context.wordsOnly || value.length >= max ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start max-md:h-10"
          onClick={() =>
            onChange([
              ...value,
              { id: crypto.randomUUID(), label: "", href: "" },
            ])
          }
        >
          <Plus aria-hidden />
          {m.siteAddButton()}
        </Button>
      )}
    </StudioField>
  );
}

function IconControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: IconId;
  onChange: (value: IconId) => void;
}) {
  return (
    <StudioField label={label}>
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start max-md:h-10"
            />
          }
          aria-label={`${label}: ${ICON_LABEL[value]()}`}
        >
          <SiteIcon icon={value} />
          {ICON_LABEL[value]()}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} className="z-50">
            <Popover.Popup className="grid w-72 grid-cols-6 gap-1 rounded-lg border bg-popover p-2 shadow-lg">
              {ICONS.map((icon) => (
                <Popover.Close
                  key={icon}
                  render={
                    <button
                      type="button"
                      aria-pressed={icon === value}
                      aria-label={ICON_LABEL[icon]()}
                      title={ICON_LABEL[icon]()}
                      className="grid size-10 place-items-center rounded-md hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    />
                  }
                  onClick={() => onChange(icon)}
                >
                  {icon === "none" ? (
                    <X aria-hidden className="size-4" />
                  ) : (
                    <SiteIcon icon={icon} className="size-5" />
                  )}
                </Popover.Close>
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </StudioField>
  );
}

function EmbedControl({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: SiteEmbed | null;
  onChange: (value: SiteEmbed | null) => void;
}) {
  const [address, setAddress] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <StudioField
      id={id}
      label={label}
      hint={
        wrong ? (
          <span className="text-destructive">{m.siteEmbedWrong()}</span>
        ) : value ? (
          m.siteEmbedCurrent({ provider: embedProviderNames[value.provider] })
        ) : (
          m.siteEmbedHint()
        )
      }
    >
      <div className="flex gap-1.5">
        <Input
          id={id}
          type="url"
          dir="ltr"
          placeholder="https://"
          value={address}
          aria-invalid={wrong || undefined}
          className="max-md:h-10"
          onChange={(event) => {
            setAddress(event.target.value);
            setWrong(false);
          }}
          onBlur={() => {
            if (!address.trim()) return;
            const embed = parseEmbedUrl(address);
            if (!embed) {
              setWrong(true);
              return;
            }
            onChange(embed);
            setAddress("");
          }}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.siteRemoveEmbed()}
            onClick={() => onChange(null)}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
    </StudioField>
  );
}

function ChoiceControl({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const text = (option: string) =>
    name === "height"
      ? (HEIGHT_LABEL[option]?.() ?? option)
      : name === "audience"
        ? (AUDIENCE_LABEL[option]?.() ?? option)
        : name === "badge"
          ? BADGE_NAME[option as (typeof BADGES)[number]] || m.siteBadgeNone()
          : /^\d+$/.test(option)
            ? formatNumber(Number(option))
            : option;
  if (options.length <= 4)
    return (
      <StudioField label={label}>
        <Segmented
          label={label}
          value={value}
          options={[...options].map((option) => ({
            value: option,
            label: text(option),
          }))}
          onChange={onChange}
        />
      </StudioField>
    );
  const id = `choice-${name}`;
  return (
    <StudioField id={id} label={label}>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id} className="w-full max-md:h-10">
          <SelectValue>{text(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {text(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StudioField>
  );
}

/** Whether a field has anything to edit in a language that only takes words. */
const hasWords = (field: Field): boolean =>
  field.kind === "items"
    ? Object.values(field.fields).some(hasWords)
    : ["text", "rich", "image", "media", "links"].includes(field.kind);

/** One field of a section, drawn from its declaration. */
export function FieldControl({
  name,
  field,
  value,
  context,
  onChange,
  prefix,
}: {
  name: string;
  field: Field;
  value: unknown;
  context: FieldContext;
  onChange: (value: unknown) => void;
  prefix: string;
}) {
  const id = `${prefix}-${name}`;
  const label = labelOf(name);
  if (context.wordsOnly && !hasWords(field)) return null;
  switch (field.kind) {
    case "text":
      return (
        <TextControl
          id={id}
          label={label}
          value={value as string}
          max={field.max}
          multiline={field.multiline}
          locale={context.locale}
          onChange={onChange}
        />
      );
    case "rich":
      return (
        <StudioField label={label}>
          <div
            lang={context.locale}
            dir={dirOf(context.locale)}
            className="min-w-0"
          >
            <ContentEditor
              id={id}
              label={label}
              value={value as ContentDocument}
              onChange={onChange}
              media={context.media}
            />
          </div>
        </StudioField>
      );
    case "image":
      return (
        <ImageControl
          id={id}
          label={label}
          value={value as SiteImage}
          context={context}
          onChange={onChange}
        />
      );
    case "media":
      return (
        <MediaControl
          id={id}
          label={label}
          value={value as SiteMedia}
          context={context}
          onChange={onChange}
        />
      );
    case "links":
      return (
        <LinksControl
          id={id}
          label={label}
          value={value as SiteLink[]}
          max={field.max}
          context={context}
          onChange={onChange}
        />
      );
    case "href":
      return (
        <StudioField id={id} label={label}>
          <HrefInput
            id={id}
            value={value as string}
            context={context}
            onChange={onChange}
          />
        </StudioField>
      );
    case "choice":
      return (
        <ChoiceControl
          name={name}
          label={label}
          options={field.options}
          value={value as string}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <StudioField id={id} label={label}>
          <Input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            value={value as number}
            className="w-24 max-md:h-10"
            onChange={(event) => {
              const next = Math.round(Number(event.target.value));
              if (Number.isFinite(next))
                onChange(Math.min(field.max, Math.max(field.min, next)));
            }}
          />
        </StudioField>
      );
    case "icon":
      return (
        <IconControl
          label={label}
          value={value as IconId}
          onChange={onChange}
        />
      );
    case "date":
      return (
        <StudioField id={id} label={label}>
          <Input
            id={id}
            type="date"
            value={value as string}
            className="w-44 max-md:h-10"
            onChange={(event) => onChange(event.target.value)}
          />
        </StudioField>
      );
    case "embed":
      return (
        <EmbedControl
          id={id}
          label={label}
          value={value as SiteEmbed | null}
          onChange={onChange}
        />
      );
    case "items":
      return (
        <ItemsControl
          id={id}
          label={label}
          field={field}
          value={value as Record<string, unknown>[]}
          context={context}
          onChange={onChange}
        />
      );
  }
  return null;
}

type Item = Record<string, unknown> & { id: string };

/** A button inside a disclosure's summary acts without opening or closing it. */
const stop = (event: MouseEvent, run: () => void) => {
  event.preventDefault();
  event.stopPropagation();
  run();
};

function summaryOf(item: Item, index: number): string {
  for (const key of ["title", "name", "label", "year", "value", "quote"]) {
    const words = item[key];
    if (typeof words === "string" && words.trim()) return words;
  }
  return m.siteItemNumber({ number: formatNumber(index + 1) });
}

function ItemsControl({
  id,
  label,
  field,
  value,
  context,
  onChange,
}: {
  id: string;
  label: string;
  field: Extract<Field, { kind: "items" }>;
  value: Record<string, unknown>[];
  context: FieldContext;
  onChange: (value: unknown) => void;
}) {
  const items = value as Item[];
  const set = (index: number, key: string, next: unknown) =>
    onChange(
      items.map((item, at) => (at === index ? { ...item, [key]: next } : item)),
    );
  return (
    <fieldset className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <legend className="text-sm leading-5 font-medium">{label}</legend>
        <span className="text-xs text-muted-foreground tabular-nums">
          {m.siteItemsOf({
            count: formatNumber(items.length),
            max: formatNumber(field.max),
          })}
        </span>
      </div>
      <ul className="grid gap-2">
        {items.map((item, index) => (
          <li key={item.id}>
            <Disclosure
              summary={summaryOf(item, index)}
              actions={
                context.wordsOnly ? null : (
                  <span className="flex shrink-0 gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={m.siteMoveUpItem({
                        item: summaryOf(item, index),
                      })}
                      disabled={index === 0}
                      onClick={(event) =>
                        stop(event, () => onChange(moved(items, index, -1)))
                      }
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={m.siteMoveDownItem({
                        item: summaryOf(item, index),
                      })}
                      disabled={index === items.length - 1}
                      onClick={(event) =>
                        stop(event, () => onChange(moved(items, index, 1)))
                      }
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={m.siteRemoveItem({
                        item: summaryOf(item, index),
                      })}
                      onClick={(event) =>
                        stop(event, () =>
                          onChange(items.filter((_, at) => at !== index)),
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                )
              }
            >
              {Object.entries(field.fields).map(([key, inner]) => (
                <FieldControl
                  key={key}
                  name={key}
                  field={inner}
                  value={item[key]}
                  context={context}
                  prefix={`${id}-${item.id}`}
                  onChange={(next) => set(index, key, next)}
                />
              ))}
            </Disclosure>
          </li>
        ))}
      </ul>
      {context.wordsOnly || items.length >= field.max ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start max-md:h-10"
          onClick={() => onChange([...items, newItem(field)])}
        >
          <Plus aria-hidden />
          {m.siteAddItem()}
        </Button>
      )}
    </fieldset>
  );
}
