import type { PictureCredit } from "@faridalms/domain/commons";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";

/** Licences a teacher's own picture is often shared under, linked to their terms. */
const LICENCES = [
  { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  {
    name: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  {
    name: "CC BY-NC 4.0",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  {
    name: "CC BY-NC-SA 4.0",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  },
  {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
] as const;

export interface CreditStrings {
  imageCredit: string;
  imageCreditAuthor: string;
  imageCreditLicence: string;
  imageCreditSource: string;
  imageCreditAllRights: string;
  imageCreditPublicDomain: string;
}

const isHttps = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * A picture's credit as its teacher writes it. A credit naming nobody and no
 * licence is none at all. A licence keeps the terms link it came with, as a
 * Commons picture's does, until its name is changed.
 */
export function creditOf(
  before: PictureCredit | null,
  author: string,
  licence: string,
  source: string,
): PictureCredit | null {
  if (!author.trim() && !licence.trim()) return null;
  const terms =
    before?.licence === licence
      ? before.licenceUrl
      : LICENCES.find((item) => item.name === licence.trim())?.url;
  return {
    author,
    licence,
    ...(terms ? { licenceUrl: terms } : {}),
    ...(isHttps(source.trim()) ? { source: source.trim() } : {}),
  };
}

const field =
  "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

/** The fields for a picture's credit, opened on request under it. */
export function CreditFields({
  credit,
  strings,
  onChange,
}: {
  credit: PictureCredit | null;
  strings: CreditStrings;
  onChange: (credit: PictureCredit | null) => void;
}) {
  const [open, setOpen] = useState(credit !== null);
  // The picture keeps a source only once it is an https link, so the words
  // typed on the way there live here.
  const [source, setSource] = useState(credit?.source ?? "");
  const licences = useId();
  const author = credit?.author ?? "";
  const licence = credit?.licence ?? "";
  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 justify-self-center text-xs text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      >
        <ChevronRight
          aria-hidden
          className={open ? "rotate-90" : "rtl:-scale-x-100"}
        />
        {strings.imageCredit}
      </button>
      {open ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <input
            aria-label={strings.imageCreditAuthor}
            placeholder={strings.imageCreditAuthor}
            value={author}
            maxLength={300}
            dir="auto"
            onChange={(event) =>
              onChange(creditOf(credit, event.target.value, licence, source))
            }
            className={field}
          />
          <input
            aria-label={strings.imageCreditLicence}
            placeholder={strings.imageCreditLicence}
            value={licence}
            maxLength={120}
            dir="auto"
            list={licences}
            onChange={(event) =>
              onChange(creditOf(credit, author, event.target.value, source))
            }
            className={field}
          />
          <datalist id={licences}>
            <option value={strings.imageCreditAllRights}>
              {strings.imageCreditAllRights}
            </option>
            {LICENCES.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value={strings.imageCreditPublicDomain}>
              {strings.imageCreditPublicDomain}
            </option>
          </datalist>
          <input
            type="url"
            aria-label={strings.imageCreditSource}
            placeholder={strings.imageCreditSource}
            value={source}
            maxLength={500}
            dir="ltr"
            onChange={(event) => {
              setSource(event.target.value);
              onChange(creditOf(credit, author, licence, event.target.value));
            }}
            className={`${field} sm:col-span-2`}
          />
        </div>
      ) : null}
    </div>
  );
}
