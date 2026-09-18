import type {
  RecipientCursor,
  MESSAGE_CATEGORIES,
} from "@faridalms/domain/school-schema";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import * as m from "~/i18n/messages";
import { recipientsQuery } from "~/queries/school";

export function RecipientPicker({
  category,
  initialLabel,
  value,
  invalid,
  onChange,
  onSelection,
  onBlur,
}: {
  category: (typeof MESSAGE_CATEGORIES)[number];
  initialLabel?: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onSelection?: (label: string) => void;
  onBlur: () => void;
}) {
  const [search, setSearch] = useState({
    q: "",
    cursors: [] as RecipientCursor[],
  });
  const deferred = useDeferredValue(search);
  const { data } = useSuspenseQuery(
    recipientsQuery(category, deferred.q, deferred.cursors.at(-1)),
  );
  const [selected, setSelected] = useState<{ id: string; label: string }>(
    () => ({ id: value, label: initialLabel ?? "" }),
  );
  const names = new Map(
    data.rows.map((person) => [
      person.id,
      person.title ? `${person.name} (${person.title})` : person.name,
    ]),
  );
  if (selected.id) names.set(selected.id, selected.label);
  const pending = search !== deferred;
  return (
    <Combobox
      items={data.rows.map((person) => person.id)}
      filter={null}
      value={value || null}
      itemToStringLabel={(id: string) => names.get(id) ?? ""}
      inputValue={search.q}
      onInputValueChange={(q) => setSearch({ q, cursors: [] })}
      onValueChange={(id) => {
        if (id) setSelected({ id, label: names.get(id) ?? "" });
        onSelection?.(id ? (names.get(id) ?? "") : "");
        onChange(id ?? "");
      }}
    >
      <ComboboxTrigger
        id="compose-recipient"
        aria-invalid={invalid}
        aria-describedby={invalid ? "compose-recipient-error" : undefined}
        onBlur={onBlur}
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-between font-normal sm:h-10"
          />
        }
      >
        <span className="truncate">
          {value ? names.get(value) : m.commComposeRecipientPlaceholder()}
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          showTrigger={false}
          aria-label={m.messageSearchRecipients()}
          placeholder={m.messageSearchRecipients()}
        />
        <div aria-busy={pending}>
          <ComboboxEmpty>{m.managementNoMatches()}</ComboboxEmpty>
          <ComboboxList>
            {(id: string) => (
              <ComboboxItem key={id} value={id} disabled={pending}>
                {names.get(id)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || !search.cursors.length}
            onClick={() =>
              setSearch((current) => ({
                ...current,
                cursors: current.cursors.slice(0, -1),
              }))
            }
          >
            {m.messagePreviousRecipients()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || !data.nextCursor}
            onClick={() => {
              const next = data.nextCursor;
              if (next)
                setSearch((current) => ({
                  ...current,
                  cursors: [...current.cursors, next],
                }));
            }}
          >
            {m.messageMoreRecipients()}
          </Button>
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
