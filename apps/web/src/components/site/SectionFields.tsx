import type { ContentDocument } from "@faridalms/domain/content";
import type {
  PageSection,
  SectionOf,
  SiteImage,
  SiteLocale,
} from "@faridalms/domain/website";

import { embedProviderNames, parseEmbedUrl } from "@faridalms/domain/embed";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { SelectField, TextField } from "~/components/system/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

import { LOCALE_NAME } from "./format";
import { PictureField } from "./PictureField";

export interface Languages {
  primary: SiteLocale;
  /** The other language when the site is bilingual. */
  other: SiteLocale | null;
}

const dirOf = (locale: SiteLocale) => (locale === "ar" ? "rtl" : "ltr");

/**
 * One piece of wording in each language the site speaks, side by side on
 * wide screens. Each control names its language, so a screen reader hears
 * "Heading, Arabic" rather than two identical labels.
 */
function Words({
  id,
  label,
  languages,
  primary,
  other,
  onPrimary,
  onOther,
  multiline = false,
  maxLength,
}: {
  id: string;
  label: string;
  languages: Languages;
  primary: string;
  other: string;
  onPrimary: (value: string) => void;
  onOther: (value: string) => void;
  multiline?: boolean;
  maxLength: number;
}) {
  const control = (
    locale: SiteLocale,
    value: string,
    onChange: (value: string) => void,
  ) => {
    const controlId = `${id}-${locale}`;
    const props = {
      id: controlId,
      lang: locale,
      dir: dirOf(locale),
      maxLength,
      value,
      "aria-label": m.siteFieldIn({
        field: label,
        language: LOCALE_NAME[locale](),
      }),
    };
    return multiline ? (
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
    );
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-sm leading-5 font-medium">{label}</span>
      <div className={cn("grid gap-2", languages.other && "md:grid-cols-2")}>
        {control(languages.primary, primary, onPrimary)}
        {languages.other ? control(languages.other, other, onOther) : null}
      </div>
    </div>
  );
}

function Bodies({
  id,
  label,
  languages,
  primary,
  other,
  onPrimary,
  onOther,
}: {
  id: string;
  label: string;
  languages: Languages;
  primary: ContentDocument;
  other: ContentDocument;
  onPrimary: (value: ContentDocument) => void;
  onOther: (value: ContentDocument) => void;
}) {
  const media = useDocumentMedia();
  const editor = (
    locale: SiteLocale,
    value: ContentDocument,
    onChange: (value: ContentDocument) => void,
  ) => (
    <div lang={locale} dir={dirOf(locale)} className="min-w-0">
      <ContentEditor
        id={`${id}-${locale}`}
        label={m.siteFieldIn({ field: label, language: LOCALE_NAME[locale]() })}
        value={value}
        onChange={onChange}
        media={media}
      />
    </div>
  );
  return (
    <div className="grid gap-1.5">
      <span className="text-sm leading-5 font-medium">{label}</span>
      <div className={cn("grid gap-3", languages.other && "xl:grid-cols-2")}>
        {editor(languages.primary, primary, onPrimary)}
        {languages.other ? editor(languages.other, other, onOther) : null}
      </div>
    </div>
  );
}

function Picture({
  id,
  languages,
  image,
  other,
  onImage,
  onOtherAlt,
}: {
  id: string;
  languages: Languages;
  image: SiteImage;
  other: SiteImage;
  onImage: (image: SiteImage) => void;
  onOtherAlt: (alt: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <PictureField
        fileId={image.fileId}
        label={m.sitePicture()}
        onChange={(fileId) => onImage({ ...image, fileId })}
      />
      {image.fileId ? (
        <Words
          id={`${id}-alt`}
          label={m.siteAltText()}
          languages={languages}
          primary={image.alt}
          other={other.alt}
          onPrimary={(alt) => onImage({ ...image, alt })}
          onOther={onOtherAlt}
          maxLength={300}
        />
      ) : null}
    </div>
  );
}

function ItemControls({
  index,
  count,
  label,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="max-md:size-10"
          aria-label={m.siteMoveUpItem({ item: label })}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="max-md:size-10"
          aria-label={m.siteMoveDownItem({ item: label })}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="max-md:size-10"
          aria-label={m.siteRemoveItem({ item: label })}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function LinkTarget({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      id={id}
      label={m.siteLinkTarget()}
      hint={m.siteLinkHint()}
      dir="ltr"
      optional
      maxLength={2048}
      value={value}
      onChange={(event) => onChange(event.target.value.trim())}
    />
  );
}

function moved<T>(items: T[], index: number, by: -1 | 1): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(index + by, 0, item);
  return next;
}

function EmbedAddress({
  section,
  onChange,
}: {
  section: SectionOf<"embed">;
  onChange: (section: SectionOf<"embed">) => void;
}) {
  const id = useId();
  const [address, setAddress] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <div className="grid gap-2">
      <TextField
        id={id}
        label={m.siteEmbedAddress()}
        hint={
          section.embedId
            ? m.siteEmbedCurrent({
                provider: embedProviderNames[section.provider],
              })
            : m.siteEmbedHint()
        }
        type="url"
        dir="ltr"
        placeholder="https://"
        value={address}
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
          onChange({ ...section, ...embed });
          setAddress("");
        }}
        errors={wrong ? [m.siteEmbedWrong()] : undefined}
      />
    </div>
  );
}

/**
 * The fields of one section: its words in each language, and once for both
 * the parts that do not change with language, such as pictures and links.
 */
export function SectionFields({
  section,
  other,
  languages,
  onChange,
  onOther,
}: {
  section: PageSection;
  other: PageSection;
  languages: Languages;
  onChange: (section: PageSection) => void;
  onOther: (section: PageSection) => void;
}) {
  const id = `section-${section.id}`;
  const heading = (
    <Words
      id={`${id}-heading`}
      label={m.siteHeading()}
      languages={languages}
      primary={section.heading}
      other={other.heading}
      onPrimary={(value) => onChange({ ...section, heading: value })}
      onOther={(value) => onOther({ ...other, heading: value })}
      maxLength={200}
    />
  );
  switch (section.type) {
    case "hero":
    case "action": {
      const translated = other as typeof section;
      return (
        <div className="grid gap-4">
          {heading}
          <Words
            id={`${id}-text`}
            label={m.siteText()}
            languages={languages}
            primary={section.text}
            other={translated.text}
            onPrimary={(value) => onChange({ ...section, text: value })}
            onOther={(value) => onOther({ ...translated, text: value })}
            multiline
            maxLength={500}
          />
          {section.type === "hero" ? (
            <Picture
              id={id}
              languages={languages}
              image={section.image}
              other={(translated as SectionOf<"hero">).image}
              onImage={(image) => onChange({ ...section, image })}
              onOtherAlt={(alt) =>
                onOther({
                  ...translated,
                  image: { ...(translated as SectionOf<"hero">).image, alt },
                } as PageSection)
              }
            />
          ) : null}
          <Words
            id={`${id}-action`}
            label={m.siteActionLabel()}
            languages={languages}
            primary={section.actionLabel}
            other={translated.actionLabel}
            onPrimary={(value) => onChange({ ...section, actionLabel: value })}
            onOther={(value) => onOther({ ...translated, actionLabel: value })}
            maxLength={80}
          />
          <LinkTarget
            id={`${id}-href`}
            value={section.actionHref}
            onChange={(value) => onChange({ ...section, actionHref: value })}
          />
        </div>
      );
    }
    case "text":
    case "imageText": {
      const translated = other as typeof section;
      return (
        <div className="grid gap-4">
          {heading}
          <Bodies
            id={`${id}-body`}
            label={m.siteBody()}
            languages={languages}
            primary={section.body}
            other={translated.body}
            onPrimary={(body) => onChange({ ...section, body })}
            onOther={(body) => onOther({ ...translated, body })}
          />
          {section.type === "imageText" ? (
            <>
              <Picture
                id={id}
                languages={languages}
                image={section.image}
                other={(translated as SectionOf<"imageText">).image}
                onImage={(image) => onChange({ ...section, image })}
                onOtherAlt={(alt) =>
                  onOther({
                    ...translated,
                    image: {
                      ...(translated as SectionOf<"imageText">).image,
                      alt,
                    },
                  } as PageSection)
                }
              />
              <SelectField
                id={`${id}-side`}
                label={m.sitePictureSide()}
                width="reference"
                value={section.side}
                options={[
                  { value: "start", label: m.sitePictureStart() },
                  { value: "end", label: m.sitePictureEnd() },
                ]}
                onChange={(side) => onChange({ ...section, side })}
              />
            </>
          ) : null}
        </div>
      );
    }
    case "cards": {
      const translated = other as SectionOf<"cards">;
      const otherItem = (itemId: string) =>
        translated.items.find((item) => item.id === itemId);
      const setOtherItem = (
        itemId: string,
        patch: Partial<SectionOf<"cards">["items"][number]>,
      ) =>
        onOther({
          ...translated,
          items: translated.items.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item,
          ),
        });
      return (
        <div className="grid gap-4">
          {heading}
          {section.items.map((item, index) => {
            const label = m.siteCardNumber({ number: formatNumber(index + 1) });
            const mirror = otherItem(item.id) ?? {
              ...item,
              title: "",
              text: "",
              image: { ...item.image, alt: "" },
            };
            const setItem = (patch: Partial<typeof item>) =>
              onChange({
                ...section,
                items: section.items.map((entry) =>
                  entry.id === item.id ? { ...entry, ...patch } : entry,
                ),
              });
            return (
              <fieldset
                key={item.id}
                className="grid gap-3 rounded-md border p-4"
              >
                <legend className="sr-only">{label}</legend>
                <ItemControls
                  index={index}
                  count={section.items.length}
                  label={label}
                  onMove={(by) =>
                    onChange({
                      ...section,
                      items: moved(section.items, index, by),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...section,
                      items: section.items.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    })
                  }
                />
                <Words
                  id={`${id}-${item.id}-title`}
                  label={m.siteCardTitle()}
                  languages={languages}
                  primary={item.title}
                  other={mirror.title}
                  onPrimary={(title) => setItem({ title })}
                  onOther={(title) => setOtherItem(item.id, { title })}
                  maxLength={120}
                />
                <Words
                  id={`${id}-${item.id}-text`}
                  label={m.siteText()}
                  languages={languages}
                  primary={item.text}
                  other={mirror.text}
                  onPrimary={(text) => setItem({ text })}
                  onOther={(text) => setOtherItem(item.id, { text })}
                  multiline
                  maxLength={300}
                />
                <Picture
                  id={`${id}-${item.id}`}
                  languages={languages}
                  image={item.image}
                  other={mirror.image}
                  onImage={(image) => setItem({ image })}
                  onOtherAlt={(alt) =>
                    setOtherItem(item.id, { image: { ...mirror.image, alt } })
                  }
                />
                <LinkTarget
                  id={`${id}-${item.id}-href`}
                  value={item.href}
                  onChange={(value) => setItem({ href: value })}
                />
              </fieldset>
            );
          })}
          {section.items.length < 12 ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() =>
                  onChange({
                    ...section,
                    items: [
                      ...section.items,
                      {
                        id: crypto.randomUUID(),
                        title: "",
                        text: "",
                        image: { fileId: null, alt: "" },
                        href: "",
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden />
                {m.siteAddCard()}
              </Button>
            </div>
          ) : null}
        </div>
      );
    }
    case "accordion": {
      const translated = other as SectionOf<"accordion">;
      const setOtherItem = (
        itemId: string,
        patch: { title?: string; text?: string },
      ) =>
        onOther({
          ...translated,
          items: translated.items.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item,
          ),
        });
      return (
        <div className="grid gap-4">
          {heading}
          {section.items.map((item, index) => {
            const label = m.siteQuestionNumber({
              number: formatNumber(index + 1),
            });
            const mirror = translated.items.find(
              (entry) => entry.id === item.id,
            ) ?? { ...item, title: "", text: "" };
            const setItem = (patch: { title?: string; text?: string }) =>
              onChange({
                ...section,
                items: section.items.map((entry) =>
                  entry.id === item.id ? { ...entry, ...patch } : entry,
                ),
              });
            return (
              <fieldset
                key={item.id}
                className="grid gap-3 rounded-md border p-4"
              >
                <legend className="sr-only">{label}</legend>
                <ItemControls
                  index={index}
                  count={section.items.length}
                  label={label}
                  onMove={(by) =>
                    onChange({
                      ...section,
                      items: moved(section.items, index, by),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...section,
                      items: section.items.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    })
                  }
                />
                <Words
                  id={`${id}-${item.id}-title`}
                  label={m.siteQuestion()}
                  languages={languages}
                  primary={item.title}
                  other={mirror.title}
                  onPrimary={(title) => setItem({ title })}
                  onOther={(title) => setOtherItem(item.id, { title })}
                  maxLength={200}
                />
                <Words
                  id={`${id}-${item.id}-text`}
                  label={m.siteAnswer()}
                  languages={languages}
                  primary={item.text}
                  other={mirror.text}
                  onPrimary={(text) => setItem({ text })}
                  onOther={(text) => setOtherItem(item.id, { text })}
                  multiline
                  maxLength={2000}
                />
              </fieldset>
            );
          })}
          {section.items.length < 30 ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() =>
                  onChange({
                    ...section,
                    items: [
                      ...section.items,
                      { id: crypto.randomUUID(), title: "", text: "" },
                    ],
                  })
                }
              >
                <Plus aria-hidden />
                {m.siteAddQuestion()}
              </Button>
            </div>
          ) : null}
        </div>
      );
    }
    case "news":
      return (
        <div className="grid gap-4">
          {heading}
          <TextField
            id={`${id}-count`}
            label={m.siteNewsCount()}
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            width="score"
            value={String(section.count)}
            onChange={(event) => {
              const count = Number(event.target.value);
              if (Number.isInteger(count) && count >= 1 && count <= 12)
                onChange({ ...section, count });
            }}
          />
        </div>
      );
    case "gallery": {
      const translated = other as SectionOf<"gallery">;
      return (
        <div className="grid gap-4">
          {heading}
          {section.images.map((image, index) => {
            const label = m.sitePictureNumber({
              number: formatNumber(index + 1),
            });
            const mirror = translated.images.find(
              (entry) => entry.id === image.id,
            ) ?? { ...image, alt: "" };
            return (
              <fieldset
                key={image.id}
                className="grid gap-3 rounded-md border p-4"
              >
                <legend className="sr-only">{label}</legend>
                <ItemControls
                  index={index}
                  count={section.images.length}
                  label={label}
                  onMove={(by) =>
                    onChange({
                      ...section,
                      images: moved(section.images, index, by),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...section,
                      images: section.images.filter(
                        (entry) => entry.id !== image.id,
                      ),
                    })
                  }
                />
                <img
                  src={`/files/${image.fileId}`}
                  alt=""
                  className="h-24 w-36 rounded-md border object-cover"
                />
                <Words
                  id={`${id}-${image.id}-alt`}
                  label={m.siteAltText()}
                  languages={languages}
                  primary={image.alt}
                  other={mirror.alt}
                  onPrimary={(alt) =>
                    onChange({
                      ...section,
                      images: section.images.map((entry) =>
                        entry.id === image.id ? { ...entry, alt } : entry,
                      ),
                    })
                  }
                  onOther={(alt) =>
                    onOther({
                      ...translated,
                      images: translated.images.map((entry) =>
                        entry.id === image.id ? { ...entry, alt } : entry,
                      ),
                    })
                  }
                  maxLength={300}
                />
              </fieldset>
            );
          })}
          {section.images.length < 24 ? (
            <PictureField
              fileId={null}
              label={m.siteGalleryPicture()}
              onChange={(fileId) => {
                if (fileId)
                  onChange({
                    ...section,
                    images: [
                      ...section.images,
                      { id: crypto.randomUUID(), fileId, alt: "" },
                    ],
                  });
              }}
            />
          ) : null}
        </div>
      );
    }
    case "contact": {
      const translated = other as SectionOf<"contact">;
      return (
        <div className="grid gap-4">
          {heading}
          <Words
            id={`${id}-text`}
            label={m.siteText()}
            languages={languages}
            primary={section.text}
            other={translated.text}
            onPrimary={(value) => onChange({ ...section, text: value })}
            onOther={(value) => onOther({ ...translated, text: value })}
            multiline
            maxLength={500}
          />
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.siteContactHint()}
          </p>
        </div>
      );
    }
    case "embed":
      return (
        <div className="grid gap-4">
          {heading}
          <EmbedAddress section={section} onChange={onChange} />
        </div>
      );
  }
  return null;
}
