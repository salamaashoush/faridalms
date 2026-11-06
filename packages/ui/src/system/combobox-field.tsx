import type { ReactNode } from "react";

import type { FieldIssue, FieldOption } from "./form-field";

import { Button } from "../button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "../combobox";

import { FormField } from "./form-field";
import { useSystemStrings } from "./provider";

/** A further page of matches the server holds back. */
export interface ComboboxMore {
  label: string;
  pending: boolean;
  onMore: () => void;
}

export interface ComboboxFieldProps {
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  clearable?: boolean;
  errors?: FieldIssue[];
  options: readonly FieldOption<string>[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  searchLabel?: string;
  emptyLabel?: string;
  more?: ComboboxMore;
}

/**
 * A picker for records too many to list in a select: the trigger shows the
 * choice, the popup searches. The caller owns the search text so it can fetch
 * matches from the server. Clear is opt-in rather than implied by optional,
 * because emptying some fields removes something and has to confirm instead.
 * Matches the server holds back for a further page come with `more`.
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
  more,
}: ComboboxFieldProps) {
  const strings = useSystemStrings();
  const searchText = searchLabel ?? strings.searchFor(label);
  const names = new Map(options.map((option) => [option.value, option.label]));
  const shared = {
    items: options.map((option) => option.value),
    itemToStringLabel: (item: string) => names.get(item) ?? "",
    filter: null,
    inputValue: search,
    onInputValueChange: onSearchChange,
  };
  const chosen = value
    .map((item) => names.get(item) ?? strings.notRecorded)
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
                {chosen || (emptyLabel ?? strings.choose(label))}
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
              <ComboboxEmpty>{strings.noMatches}</ComboboxEmpty>
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
              {more ? (
                <div className="border-t p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start max-md:h-10"
                    disabled={more.pending}
                    onClick={more.onMore}
                  >
                    {more.label}
                  </Button>
                </div>
              ) : null}
              {clearable && value.length ? (
                <div className="border-t p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start max-md:h-10"
                    onClick={() => onChange([])}
                  >
                    {strings.clear}
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
