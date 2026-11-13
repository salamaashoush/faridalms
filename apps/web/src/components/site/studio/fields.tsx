import type { Picture, PictureFocus } from "@faridalms/domain/commons";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  BADGES,
  BlockType,
  Field,
  SiteBlock,
  SiteColumn,
  IconId,
  SiteEmbed,
  SiteLink,
  SiteLocale,
  SiteMedia,
} from "@faridalms/domain/site-sections";
import type { EditorMedia } from "@faridalms/editor";
import type { MouseEvent, PointerEvent, ReactNode } from "react";

import { Popover } from "@base-ui/react/popover";
import { embedProviderNames, parseEmbedUrl } from "@faridalms/domain/embed";
import {
  BLOCK_TYPES,
  blockFieldsOf,
  ICONS,
  itemFieldShown,
  itemValue,
  MAX_BLOCKS,
  newBlock,
  newItem,
} from "@faridalms/domain/site-sections";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { Input } from "@faridalms/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Segmented } from "@faridalms/ui/system/panel";
import { Textarea } from "@faridalms/ui/textarea";
import { useRouteContext } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Captions,
  Film,
  ImageIcon,
  ImagePlus,
  Plus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ChooseFromMedia } from "~/components/media/ChooseFromMedia";
import { CheckboxRow } from "~/components/people/fields";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";
import { everyFilling } from "~/utils/extension";
import { useWords } from "~/utils/words";

import type { ClassChoice } from "./class-picker";

import { SiteIcon } from "../render/parts";
import { siteAudiences, siteChoiceFields } from "../slots";
import { ClassPicker, CoursePicker } from "./class-picker";
import { Disclosure, StudioField } from "./controls";
import { HeadingInput } from "./heading-input";
import { itemTitle } from "./item-title";
import {
  AUDIENCE_LABEL,
  BLOCK_LABEL,
  CHOICE_LABEL,
  FIELD_HINT,
  FIELD_LABEL,
  ICON_LABEL,
} from "./labels";

export interface FieldContext {
  /** The language whose words are being edited. */
  locale: SiteLocale;
  /** Only words change in this language; pictures, links and layout follow the original. */
  wordsOnly: boolean;
  pages: { href: string; title: string }[];
  media: EditorMedia;
  /** The school's intakes still to close, which a section may name. */
  intakes: { id: string; label: string }[];
  /** The school's classes still running or to start, which a courses section may list. */
  classes?: ClassChoice[];
  /** The school's courses, whose classes a courses section may list. */
  courses?: { id: string; label: string }[];
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

export interface FilePickProps {
  accept: string[];
  label: string;
  busy: boolean;
  onFile: (file: File | undefined) => void;
  icon?: ReactNode;
}

export function FilePick({ accept, label, busy, onFile, icon }: FilePickProps) {
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

interface TextControlProps {
  id: string;
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  locale: SiteLocale;
  hint?: string;
  /** Words drawn through the heading component, whose selected words can be emphasised. */
  emphasis?: boolean;
  onChange: (value: string) => void;
}

function TextControl({
  id,
  label,
  value,
  max,
  multiline,
  locale,
  hint,
  emphasis = false,
  onChange,
}: TextControlProps) {
  const near = value.length > max * 0.8;
  const props = { id, value, maxLength: max, lang: locale, dir: dirOf(locale) };
  return (
    <StudioField
      id={id}
      label={label}
      hint={hint}
      counter={
        near ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {m.siteCharactersLeft({ count: max - value.length })}
          </span>
        ) : null
      }
    >
      {emphasis ? (
        <HeadingInput
          id={id}
          value={value}
          max={max}
          locale={locale}
          onChange={onChange}
        />
      ) : multiline ? (
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

interface AltTextProps {
  id: string;
  value: string;
  locale: SiteLocale;
  onChange: (alt: string) => void;
}

function AltText({ id, value, locale, onChange }: AltTextProps) {
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

interface ThumbProps {
  fileId: string | null;
  video?: boolean;
}

function Thumb({ fileId, video = false }: ThumbProps) {
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

const CENTRE: PictureFocus = { x: 50, y: 50 };
const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const percent = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value)));

export interface FocusPickerProps {
  src: string;
  value?: PictureFocus;
  onChange: (focus: PictureFocus) => void;
}

/** The spot every crop of a picture keeps in view, set by dragging a dot onto it. */
export function FocusPicker({
  src,
  value = CENTRE,
  onChange,
}: FocusPickerProps) {
  const place = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onChange({
      x: percent(((event.clientX - box.left) / box.width) * 100),
      y: percent(((event.clientY - box.top) / box.height) * 100),
    });
  };
  return (
    <div className="grid gap-1.5">
      <div
        className="relative w-fit max-w-full cursor-crosshair touch-none overflow-hidden rounded-md border select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          place(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            place(event);
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="block max-h-44 w-auto max-w-full"
        />
        <button
          type="button"
          aria-label={m.siteFocusHandle({
            x: formatNumber(value.x),
            y: formatNumber(value.y),
          })}
          onKeyDown={(event) => {
            const step = NUDGE[event.key];
            if (!step) return;
            event.preventDefault();
            const by = event.shiftKey ? 1 : 5;
            onChange({
              x: percent(value.x + step[0] * by),
              y: percent(value.y + step[1] * by),
            });
          }}
          className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/70 shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.3)] outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          style={{ left: `${value.x}%`, top: `${value.y}%` }}
        />
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.siteFocusHint()}
      </p>
    </div>
  );
}

interface ImageControlProps {
  id: string;
  label: string;
  value: Picture;
  context: FieldContext;
  onChange: (value: Picture) => void;
}

function ImageControl({
  id,
  label,
  value,
  context,
  onChange,
}: ImageControlProps) {
  const { busy, upload } = useUpload(context.media);
  const framed = context.wordsOnly ? null : value.fileId;
  return (
    <StudioField label={label}>
      {framed ? (
        <FocusPicker
          src={fileUrl(framed)}
          value={value.focus}
          onChange={(focus) => onChange({ ...value, focus })}
        />
      ) : null}
      <div className="flex items-center gap-3">
        {framed ? null : <Thumb fileId={value.fileId} />}
        {context.wordsOnly ? null : (
          <div className="flex flex-wrap gap-1.5">
            <FilePick
              accept={context.media.accept.image}
              label={value.fileId ? m.siteReplace() : m.siteUpload()}
              busy={busy}
              onFile={(file) =>
                void upload(file, (fileId) =>
                  onChange({ fileId, alt: value.alt }),
                )
              }
            />
            <ChooseFromMedia
              media={context.media.school}
              kind="image"
              onChoose={(chosen) =>
                onChange({
                  fileId: chosen.fileId,
                  alt: chosen.alt,
                  ...(chosen.credit ? { credit: chosen.credit } : {}),
                })
              }
            />
            {value.fileId && context.media.people ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:h-10"
                onClick={() => {
                  if (value.fileId) context.media.people?.(value.fileId);
                }}
              >
                <UsersRound aria-hidden />
                {m.editorPicturePeople()}
              </Button>
            ) : null}
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
      {value.fileId && !context.wordsOnly ? (
        <CheckboxRow
          label={m.editorImageDecorative()}
          checked={value.decorative ?? false}
          onChange={(decorative) => onChange({ ...value, decorative })}
        />
      ) : null}
      {value.fileId && !value.decorative ? (
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

interface MediaControlProps {
  id: string;
  label: string;
  value: SiteMedia;
  context: FieldContext;
  onChange: (value: SiteMedia) => void;
}

function MediaControl({
  id,
  label,
  value,
  context,
  onChange,
}: MediaControlProps) {
  const { busy, upload } = useUpload(context.media);
  const video = value.kind === "video";
  const framed = video || context.wordsOnly ? null : value.fileId;
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
      {framed ? (
        <FocusPicker
          src={fileUrl(framed)}
          value={value.focus}
          onChange={(focus) => onChange({ ...value, focus })}
        />
      ) : null}
      <div className="flex items-center gap-3">
        {framed ? null : (
          <Thumb
            fileId={video ? (value.posterFileId ?? value.fileId) : value.fileId}
            video={video && !value.posterFileId}
          />
        )}
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
                void upload(file, (fileId) =>
                  onChange({ ...value, fileId, focus: undefined }),
                )
              }
            />
            <ChooseFromMedia
              media={context.media.school}
              kind={video ? "video" : "image"}
              onChoose={(chosen) =>
                onChange({
                  ...value,
                  fileId: chosen.fileId,
                  focus: undefined,
                  alt: video ? value.alt : chosen.alt,
                  credit: video ? value.credit : chosen.credit,
                })
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

interface HrefInputProps {
  id: string;
  value: string;
  context: FieldContext;
  onChange: (value: string) => void;
  label?: string;
}

function HrefInput({ id, value, context, onChange, label }: HrefInputProps) {
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

/** A button inside a disclosure's summary acts without opening or closing it. */
const stop = (event: MouseEvent, run: () => void) => {
  event.preventDefault();
  event.stopPropagation();
  run();
};

function moved<T>(items: T[], index: number, by: -1 | 1): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(index + by, 0, item);
  return next;
}

interface LinksControlProps {
  id: string;
  label: string;
  value: SiteLink[];
  max: number;
  context: FieldContext;
  onChange: (value: SiteLink[]) => void;
}

function LinksControl({
  id,
  label,
  value,
  max,
  context,
  onChange,
}: LinksControlProps) {
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

interface IconControlProps {
  label: string;
  value: IconId;
  onChange: (value: IconId) => void;
}

function IconControl({ label, value, onChange }: IconControlProps) {
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

interface EmbedControlProps {
  id: string;
  label: string;
  value: SiteEmbed | null;
  onChange: (value: SiteEmbed | null) => void;
}

function EmbedControl({ id, label, value, onChange }: EmbedControlProps) {
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

interface ChoiceControlProps {
  /** Unique on the panel, since items repeat the same field. */
  id: string;
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}

function ChoiceControl({
  id,
  name,
  label,
  options,
  value,
  onChange,
}: ChoiceControlProps) {
  const { extensions } = useRouteContext({ from: "__root__" });
  const lent = useSlot(siteAudiences);
  const lendable = everyFilling(extensions, siteAudiences);
  const offered =
    name === "audience"
      ? options.filter(
          (option) =>
            option === value ||
            !lendable.includes(option) ||
            lent.includes(option),
        )
      : options;
  const text = (option: string) =>
    name === "badge"
      ? BADGE_NAME[option as (typeof BADGES)[number]] || m.siteBadgeNone()
      : (CHOICE_LABEL[name]?.[option]?.() ??
        AUDIENCE_LABEL[option]?.() ??
        (/^\d+$/.test(option) ? formatNumber(Number(option)) : option));
  if (offered.length <= 4)
    return (
      <StudioField label={label}>
        <Segmented
          label={label}
          value={value}
          options={[...offered].map((option) => ({
            value: option,
            label: text(option),
          }))}
          onChange={onChange}
        />
      </StudioField>
    );
  return (
    <StudioField id={id} label={label}>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id} className="w-full max-md:h-10">
          <SelectValue>{text(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {offered.map((option) => (
            <SelectItem key={option} value={option}>
              {text(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StudioField>
  );
}

interface IntakeControlProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  intakes: FieldContext["intakes"];
  onChange: (value: string) => void;
}

/** One of the school's intakes, or every intake open, for a section that leads into applying. */
function IntakeControl({
  id,
  label,
  hint,
  value,
  intakes,
  onChange,
}: IntakeControlProps) {
  const options = [{ id: "", label: m.siteIntakeAny() }, ...intakes];
  const shown =
    options.find((option) => option.id === value)?.label ?? m.siteIntakeGone();
  return (
    <StudioField id={id} label={label} hint={hint}>
      <Select value={value} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger id={id} className="w-full max-md:h-10">
          <SelectValue>{shown}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id || "any"} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StudioField>
  );
}

interface RichControlProps {
  id: string;
  label: string;
  value: ContentDocument;
  media: EditorMedia;
  /** The body is a form's questions, which a family answers. */
  form?: boolean;
  onChange: (value: ContentDocument) => void;
}

/**
 * A rich body. The editor keeps its own words as they are typed, so a
 * change made to the page from outside it, as an undo is, is put into it;
 * otherwise the next key pressed would bring the undone words back.
 */
function RichControl({
  id,
  label,
  value,
  media,
  form = false,
  onChange,
}: RichControlProps) {
  const written = useRef(JSON.stringify(value));
  const [replace, setReplace] = useState<{
    to: ContentDocument;
    at: number;
    quiet: true;
  }>();
  const words = JSON.stringify(value);
  useEffect(() => {
    if (words === written.current) return;
    written.current = words;
    setReplace((before) => ({
      to: value,
      at: (before?.at ?? 0) + 1,
      quiet: true,
    }));
  }, [words, value]);
  return (
    <ContentEditor
      id={id}
      label={label}
      value={value}
      replace={replace}
      // A visitor who is not signed in answers a form, so it holds no files.
      media={form ? undefined : media}
      questions={form}
      forms={form}
      sharedBlocks={!form}
      onChange={(next) => {
        written.current = JSON.stringify(next);
        onChange(next);
      }}
    />
  );
}

/** Whether a field has anything to edit in a language that only takes words. */
const hasWords = (field: Field): boolean =>
  field.kind === "items"
    ? Object.values(field.fields).some(hasWords)
    : ["text", "rich", "image", "media", "links", "columns"].includes(
        field.kind,
      );

/** Fields drawn through the heading component, where asterisks mark emphasis. */
const EMPHASISABLE = new Set(["heading"]);

export interface FieldControlProps {
  name: string;
  field: Field;
  value: unknown;
  context: FieldContext;
  onChange: (value: unknown) => void;
  prefix: string;
}

/** One field of a section, drawn from its declaration. */
export function FieldControl({
  name,
  field,
  value,
  context,
  onChange,
  prefix,
}: FieldControlProps) {
  const choices = useSlot(siteChoiceFields);
  const words = useWords();
  const hint = FIELD_HINT[name];
  const fieldHint = hint ? words(hint)() : undefined;
  const id = `${prefix}-${name}`;
  const label = labelOf(name);
  if (context.wordsOnly && !hasWords(field)) return null;
  // A school without grade levels asks no grade, so offers no such choice.
  if (name === "grade" && field.kind === "choice" && !choices.includes(name))
    return null;
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
          hint={EMPHASISABLE.has(name) ? m.siteHeadingFieldHint() : fieldHint}
          emphasis={EMPHASISABLE.has(name)}
          onChange={onChange}
        />
      );
    case "rich":
      return (
        <StudioField label={label} hint={fieldHint}>
          <div
            lang={context.locale}
            dir={dirOf(context.locale)}
            className="min-w-0"
          >
            <RichControl
              id={id}
              label={label}
              value={value as ContentDocument}
              media={context.media}
              form={Boolean(field.questions)}
              onChange={onChange}
            />
          </div>
        </StudioField>
      );
    case "image":
      return (
        <ImageControl
          id={id}
          label={label}
          value={value as Picture}
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
          id={id}
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
    case "intake":
      return (
        <IntakeControl
          id={id}
          label={label}
          hint={fieldHint}
          value={value as string}
          intakes={context.intakes}
          onChange={onChange}
        />
      );
    case "classes":
      return (
        <ClassPicker
          id={id}
          label={label}
          hint={fieldHint}
          value={value as string[]}
          max={field.max}
          classes={context.classes ?? []}
          onChange={onChange}
        />
      );
    case "course":
      return (
        <CoursePicker
          id={id}
          label={label}
          value={value as string}
          courses={context.courses ?? []}
          onChange={onChange}
        />
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
          hint={fieldHint}
          field={field}
          value={value as Record<string, unknown>[]}
          context={context}
          onChange={onChange}
        />
      );
    case "columns":
      return (
        <ColumnsControl
          id={id}
          value={value as SiteColumn[]}
          context={context}
          onChange={onChange}
        />
      );
  }
  return null;
}

interface ColumnsControlProps {
  id: string;
  value: SiteColumn[];
  context: FieldContext;
  onChange: (value: SiteColumn[]) => void;
}

/**
 * The blocks of each column: open one to edit it, add blocks from the
 * list, and move them within their column.
 */
function ColumnsControl({ id, value, context, onChange }: ColumnsControlProps) {
  const setColumn = (index: number, blocks: SiteBlock[]) =>
    onChange(
      value.map((column, at) =>
        at === index ? { ...column, blocks } : column,
      ),
    );
  return (
    <div className="grid gap-3">
      {value.map((column, index) => (
        <fieldset
          key={column.id}
          className="grid gap-2 rounded-xl border border-dashed p-2.5"
        >
          <legend className="px-1 text-sm font-medium">
            {m.siteColumnBlocks({ number: formatNumber(index + 1) })}
          </legend>
          {column.blocks.length === 0 ? (
            <div className="px-1">
              <EmptyState placement="section" title={m.siteNoBlocks()} />
            </div>
          ) : null}
          <ul className="grid gap-2">
            {column.blocks.map((block, at) => {
              const name = BLOCK_LABEL[block.type]();
              const setBlock = (next: SiteBlock) =>
                setColumn(
                  index,
                  column.blocks.map((item) =>
                    item.id === next.id ? next : item,
                  ),
                );
              return (
                <li key={block.id}>
                  <Disclosure
                    summary={name}
                    actions={
                      context.wordsOnly ? null : (
                        <span className="flex shrink-0 gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={m.siteMoveBlockUp({ block: name })}
                            disabled={at === 0}
                            onClick={(event) =>
                              stop(event, () =>
                                setColumn(index, moved(column.blocks, at, -1)),
                              )
                            }
                          >
                            <ArrowUp aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={m.siteMoveBlockDown({ block: name })}
                            disabled={at === column.blocks.length - 1}
                            onClick={(event) =>
                              stop(event, () =>
                                setColumn(index, moved(column.blocks, at, 1)),
                              )
                            }
                          >
                            <ArrowDown aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={m.siteRemoveBlock({ block: name })}
                            onClick={(event) =>
                              stop(event, () =>
                                setColumn(
                                  index,
                                  column.blocks.filter(
                                    (item) => item.id !== block.id,
                                  ),
                                ),
                              )
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </span>
                      )
                    }
                  >
                    {Object.entries(blockFieldsOf(block.type)).map(
                      ([key, field]) => (
                        <FieldControl
                          key={key}
                          name={key}
                          field={field}
                          value={(block.data as Record<string, unknown>)[key]}
                          context={context}
                          prefix={`${id}-${block.id}`}
                          onChange={(next) =>
                            setBlock({
                              ...block,
                              data: { ...block.data, [key]: next },
                            } as SiteBlock)
                          }
                        />
                      ),
                    )}
                  </Disclosure>
                </li>
              );
            })}
          </ul>
          {context.wordsOnly || column.blocks.length >= MAX_BLOCKS ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start max-md:h-10"
                  />
                }
              >
                <Plus aria-hidden />
                {m.siteAddBlock()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {BLOCK_TYPES.map((type: BlockType) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() =>
                      setColumn(index, [...column.blocks, newBlock(type)])
                    }
                  >
                    {BLOCK_LABEL[type]()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </fieldset>
      ))}
    </div>
  );
}

type Item = Record<string, unknown> & { id: string };

interface ItemsControlProps {
  id: string;
  label: string;
  hint?: string;
  field: Extract<Field, { kind: "items" }>;
  value: Record<string, unknown>[];
  context: FieldContext;
  onChange: (value: unknown) => void;
}

function ItemsControl({
  id,
  label,
  hint,
  field,
  value,
  context,
  onChange,
}: ItemsControlProps) {
  const items = value as Item[];
  const set = (index: number, key: string, next: unknown) =>
    onChange(
      items.map((item, at) => (at === index ? { ...item, [key]: next } : item)),
    );
  return (
    // A legend names its fieldset only as the fieldset's first child, and
    // this one shares a row with the count, so the group points at it.
    <fieldset className="grid gap-2" aria-labelledby={`${id}-label`}>
      <div className="flex items-baseline justify-between">
        <span id={`${id}-label`} className="text-sm leading-5 font-medium">
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {m.siteItemsOf({
            count: formatNumber(items.length),
            max: formatNumber(field.max),
          })}
        </span>
      </div>
      {hint ? (
        <p className="-mt-1 text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <ul className="grid gap-2">
        {items.map((item, index) => {
          const title = itemTitle(item, field.fields);
          const name =
            title ?? m.siteItemNumber({ number: formatNumber(index + 1) });
          return (
            <li key={item.id}>
              <Disclosure
                summary={
                  title ? (
                    <span lang={context.locale} dir={dirOf(context.locale)}>
                      {title}
                    </span>
                  ) : (
                    name
                  )
                }
                actions={
                  context.wordsOnly ? null : (
                    <span className="flex shrink-0 gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={m.siteMoveUpItem({ item: name })}
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
                        aria-label={m.siteMoveDownItem({ item: name })}
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
                        aria-label={m.siteRemoveItem({ item: name })}
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
                {Object.entries(field.fields)
                  .filter(([, inner]) => itemFieldShown(inner, item))
                  .map(([key, inner]) => (
                    <FieldControl
                      key={key}
                      name={key}
                      field={inner}
                      value={itemValue(item, key, inner)}
                      context={context}
                      prefix={`${id}-${item.id}`}
                      onChange={(next) => set(index, key, next)}
                    />
                  ))}
              </Disclosure>
            </li>
          );
        })}
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
