import {
  bandContrast,
  bandText,
  brandReadable,
  READABLE,
  readableBrand,
} from "@faridalms/domain/brand";
import { portalAccent } from "@faridalms/domain/portal-face";
import { Button } from "@faridalms/ui/button";
import { TextField } from "@faridalms/ui/system/form-field";
import { GraduationCap } from "lucide-react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";
import { useWords } from "~/utils/words";

const HEX = /^#[0-9A-F]{6}$/;

/** A colour as the field holds it, in capitals with its hash, or null while it is not one. */
export function brandColourOf(value: string): string | null {
  const colour = value.trim().toUpperCase();
  const hashed = colour.startsWith("#") ? colour : `#${colour}`;
  return HEX.test(hashed) ? hashed : null;
}

/** Why the colour in the field cannot be saved, or null when it can. */
export function brandColourError(value: string): string | null {
  if (value.trim() === "") return null;
  const colour = brandColourOf(value);
  if (!colour) return m.settingsBrandInvalid();
  if (!brandReadable(colour))
    return m.settingsBrandUnreadable({
      ratio: formatNumber(Math.floor(bandContrast(colour) * 10) / 10),
      needed: formatNumber(READABLE),
    });
  return null;
}

export interface BrandColourFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** The school's name, as the preview's sign-in band shows it. */
  schoolName: string;
  /** The colour the sign-in pages take while the field is empty, where a module lends one. */
  unset: string | null;
}

/**
 * The school's brand colour beside its logo: a colour picker and its hex
 * code, a preview of the sign-in band in it, and a refusal with the
 * nearest readable shade where its words would not meet WCAG AA.
 */
export function BrandColourField({
  value,
  onChange,
  schoolName,
  unset,
}: BrandColourFieldProps) {
  const words = useWords();
  const colour = brandColourOf(value);
  const error = brandColourError(value);
  const shown =
    value.trim() === ""
      ? unset
      : colour && brandReadable(colour)
        ? colour
        : null;
  const accent = shown ? portalAccent(shown).light : null;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm leading-5 font-medium">
        {m.settingsBrand()}
      </legend>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {words(m.settingsBrandHintCore)()}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="color"
          aria-label={m.settingsBrandPicker()}
          value={(colour ?? "#000000").toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <TextField
          id="school-brand-colour"
          label={m.settingsBrandCode()}
          optional
          dir="ltr"
          width="reference"
          autoComplete="off"
          placeholder="#0B3D91"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          errors={error ? [error] : undefined}
        />
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange("")}>
            {m.settingsBrandClear()}
          </Button>
        ) : null}
      </div>
      {colour && !brandReadable(colour) ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => onChange(readableBrand(colour))}
        >
          {m.settingsBrandUseReadable({ colour: readableBrand(colour) })}
        </Button>
      ) : null}
      <figure className="grid gap-1.5">
        <figcaption className="text-[13px] leading-[18px] text-muted-foreground">
          {value.trim() === "" && unset
            ? words(m.settingsBrandPreviewUnsetCore)()
            : shown
              ? m.settingsBrandPreview()
              : m.settingsBrandPreviewPlatform()}
        </figcaption>
        <div className="grid max-w-xl overflow-hidden rounded-lg border sm:grid-cols-2">
          <div
            data-testid="brand-preview"
            className="grid content-start gap-3 bg-brand p-5 text-brand-foreground"
            style={
              shown ? { background: shown, color: bandText(shown) } : undefined
            }
          >
            <span className="flex items-center gap-2 font-semibold">
              <GraduationCap aria-hidden className="size-5" />
              <span dir="auto">{schoolName}</span>
            </span>
            <span className="text-xl font-medium">
              {m.settingsBrandPreviewHeading()}
            </span>
            <span className="text-sm opacity-75">
              {m.settingsBrandPreviewBody()}
            </span>
          </div>
          <div className="grid content-center gap-3 bg-background p-5">
            <span className="h-8 rounded-md border" aria-hidden />
            <span
              className="justify-self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              style={
                accent
                  ? {
                      background: accent.primary,
                      color: accent.primaryForeground,
                    }
                  : undefined
              }
            >
              {m.settingsBrandPreviewButton()}
            </span>
          </div>
        </div>
      </figure>
    </fieldset>
  );
}
