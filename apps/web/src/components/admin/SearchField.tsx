import { Input } from "@faridalms/ui/input";
import { Search, X } from "lucide-react";
import { useId } from "react";

import * as m from "~/i18n/messages";

export function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className="relative w-full sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="ps-8 pe-9"
      />
      {value === "" ? null : (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={m.commonClear()}
          className="absolute end-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
