import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import * as m from "~/i18n/messages";

import { FormField } from "./field";

type Issue = { message?: string } | string | undefined | null;

/**
 * A picker for records too many to list in a select: the trigger shows the
 * choice, the popup searches. The caller owns the search text so it can fetch
 * matches from the server. Clear is opt-in rather than implied by optional,
 * because emptying some fields removes something and has to confirm instead.
 */
export function ComboboxField({
  label,
  hint,
  optional,
  clearable = false,
  errors,
  options,
  value,
  onChange,
  multiple = false,
  search,
  onSearchChange,
  searchLabel,
  emptyLabel,
}: {
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  clearable?: boolean;
  errors?: Issue[];
  options: readonly { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  searchLabel?: string;
  emptyLabel?: string;
}) {
  const searchText = searchLabel ?? m.managementSearchFor({ label });
  const names = new Map(options.map((option) => [option.value, option.label]));
  const shared = {
    items: options.map((option) => option.value),
    itemToStringLabel: (item: string) => names.get(item) ?? "",
    filter: null,
    inputValue: search,
    onInputValueChange: onSearchChange,
  };
  const chosen = value
    .map((item) => names.get(item) ?? m.commonNotRecorded())
    .join(", ");
  return (
    <FormField label={label} optional={optional} hint={hint} errors={errors}>
      {(control) => {
        const content = (
          <>
            <ComboboxTrigger
              {...control}
              aria-labelledby={`${control.id}-label ${control.id}`}
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-w-0 justify-between border-input bg-transparent px-2.5 font-normal aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 max-md:h-10 dark:bg-input/30"
                />
              }
            >
              <span
                dir="auto"
                className={
                  chosen
                    ? "min-w-0 flex-1 truncate text-start"
                    : "min-w-0 flex-1 truncate text-start text-muted-foreground"
                }
              >
                {chosen || (emptyLabel ?? m.managementChoose({ label }))}
              </span>
            </ComboboxTrigger>
            {/* The vendored popup is 28px wider than its trigger, which makes
                Base UI flip it to the end edge and past the sheet. */}
            <ComboboxContent align="start" className="min-w-(--anchor-width)">
              <ComboboxInput
                showTrigger={false}
                aria-label={searchText}
                placeholder={searchText}
              />
              <ComboboxEmpty>{m.managementNoMatches()}</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem
                    key={item}
                    value={item}
                    className="max-md:min-h-10"
                  >
                    <span dir="auto" className="truncate">
                      {names.get(item)}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
              {clearable && value.length ? (
                <div className="border-t p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start max-md:h-10"
                    onClick={() => onChange([])}
                  >
                    {m.commonClear()}
                  </Button>
                </div>
              ) : null}
            </ComboboxContent>
          </>
        );
        return multiple ? (
          <Combobox {...shared} multiple value={value} onValueChange={onChange}>
            {content}
          </Combobox>
        ) : (
          <Combobox
            {...shared}
            value={value[0] ?? null}
            onValueChange={(next) => onChange(next ? [next] : [])}
          >
            {content}
          </Combobox>
        );
      }}
    </FormField>
  );
}
