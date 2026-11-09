import { Input } from "@faridalms/ui/input";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { FilteredEmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { toast } from "sonner";

import {
  classChoices,
  classTitle,
  defaultClass,
} from "~/components/classes/format";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery, reusableQuery } from "~/queries/coursework";
import { reuseAssignment } from "~/server/coursework";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export interface UseAgainSheetProps {
  source: { id: string; title: string } | null;
  /** The class to offer first, where the teacher is working now. */
  classId?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Sets an assignment again as a new draft in one of the teacher's classes,
 * as Classroom's "Reuse post" does: the one given, or one found among the
 * teacher's work from any class or year.
 */
export function UseAgainSheet({
  source,
  classId,
  open,
  onClose,
}: UseAgainSheetProps) {
  const navigate = useNavigate();
  const classes = useQuery(courseworkOptionsQuery).data?.classes ?? [];
  const [chosen, setChosen] = useState(source?.id ?? "");
  const [target, setTarget] = useState(classId ?? "");
  const [search, setSearch] = useState("");
  const [unchosen, setUnchosen] = useState(false);
  const words = useDeferredValue(search.trim());
  const searchId = useId();
  const found = useQuery({ ...reusableQuery(words), enabled: !source });
  const setIn = target || defaultClass(classes)?.id || "";
  const reuse = useMutation({
    mutationFn: () => reuseAssignment({ data: { id: chosen, classId: setIn } }),
  });
  const rows = found.data ?? [];
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={
        source
          ? m.courseworkUseAgainOf({ title: source.title })
          : m.courseworkUseAgainTitle()
      }
      submitLabel={m.courseworkUseAgain()}
      pending={reuse.isPending}
      error={
        reuse.error
          ? getMessageFromError(reuse.error)
          : unchosen
            ? m.courseworkUseAgainChoose()
            : null
      }
      onSubmit={async () => {
        if (!chosen || !setIn) {
          setUnchosen(true);
          return;
        }
        await reuse.mutateAsync().then(
          async (done) => {
            toast.success(m.courseworkUsedAgain());
            onClose();
            await navigate({
              to: "/assignment-editor",
              search: { id: done.id },
            });
          },
          () => undefined,
        );
      }}
    >
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.courseworkUseAgainHint()}
      </p>
      {source ? null : (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-2 text-sm leading-5 font-medium">
            {m.courseworkUseAgainPick()}
          </legend>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              type="search"
              dir="auto"
              aria-label={m.courseworkUseAgainSearch()}
              value={search}
              placeholder={m.courseworkUseAgainSearch()}
              onChange={(event) => setSearch(event.target.value)}
              className="ps-8 max-md:h-10"
            />
          </div>
          {found.isPending ? (
            <div aria-busy="true" className="min-h-24" />
          ) : rows.length === 0 ? (
            <FilteredEmptyState
              placement="section"
              title={m.courseworkUseAgainNone()}
            />
          ) : (
            <RadioGroup
              aria-label={m.courseworkUseAgainPick()}
              value={chosen}
              onValueChange={(next) => {
                setChosen(String(next));
                setUnchosen(false);
              }}
              className="grid max-h-72 gap-0 overflow-y-auto rounded-md border"
            >
              {rows.map((row) => (
                <label
                  key={row.id}
                  htmlFor={`${searchId}-${row.id}`}
                  className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/50 has-data-checked:bg-primary/5"
                >
                  <RadioGroupItem
                    id={`${searchId}-${row.id}`}
                    value={row.id}
                    className="mt-0.5"
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span
                      dir="auto"
                      className="truncate text-sm leading-5 font-medium"
                    >
                      {row.title}
                    </span>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {classTitle({
                        code: row.classCode,
                        titleEn: row.classTitleEn,
                        titleAr: row.classTitleAr,
                      })}
                      {" · "}
                      {formatDate(row.createdAt)}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
        </fieldset>
      )}
      <SelectField
        id="use-again-class"
        label={m.courseworkUseAgainIn()}
        value={setIn}
        options={classChoices(classes)}
        onChange={setTarget}
      />
    </SheetForm>
  );
}
