import type { RubricCriterion } from "@faridalms/domain/assignment";

import { Plus, Trash2 } from "lucide-react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export function RubricEditor({
  value,
  onChange,
  maxScore,
  disabled = false,
  errors,
}: {
  value: RubricCriterion[];
  onChange: (value: RubricCriterion[]) => void;
  maxScore: number;
  disabled?: boolean;
  errors?: Array<{ message?: string } | undefined>;
}) {
  const total = value.reduce((sum, row) => sum + row.maxPoints, 0);
  const update = (id: string, patch: Partial<RubricCriterion>) =>
    onChange(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  return (
    <Field data-invalid={Boolean(errors?.some(Boolean)) || undefined}>
      <FieldLabel>{m.rubricTitle()}</FieldLabel>
      <FieldDescription>{m.rubricHint()}</FieldDescription>
      {value.length ? (
        <ul className="space-y-3">
          {value.map((row, index) => (
            <li
              key={row.id}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_7rem_auto]"
            >
              <Input
                aria-label={m.rubricCriterionTitle({
                  number: formatNumber(index + 1),
                })}
                placeholder={m.rubricCriterionTitle({
                  number: formatNumber(index + 1),
                })}
                value={row.title}
                maxLength={255}
                disabled={disabled}
                onChange={(event) =>
                  update(row.id, { title: event.target.value })
                }
              />
              <Input
                aria-label={m.rubricCriterionDescription({
                  number: formatNumber(index + 1),
                })}
                placeholder={m.rubricCriterionDescription({
                  number: formatNumber(index + 1),
                })}
                value={row.description}
                maxLength={2000}
                disabled={disabled}
                onChange={(event) =>
                  update(row.id, { description: event.target.value })
                }
              />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                aria-label={m.rubricCriterionPoints({
                  number: formatNumber(index + 1),
                })}
                value={row.maxPoints}
                disabled={disabled}
                onChange={(event) =>
                  update(row.id, {
                    maxPoints: Math.max(
                      1,
                      Math.trunc(event.target.valueAsNumber || 1),
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={m.rubricRemoveCriterion({
                  number: formatNumber(index + 1),
                })}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== row.id))
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || value.length >= 20}
          onClick={() =>
            onChange([
              ...value,
              {
                id: crypto.randomUUID(),
                title: "",
                description: "",
                maxPoints: 1,
              },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          {m.rubricAddCriterion()}
        </Button>
        {value.length ? (
          <span
            className={
              total === maxScore
                ? "text-sm text-muted-foreground"
                : "text-sm text-destructive"
            }
          >
            {m.rubricTotal({
              total: formatNumber(total),
              max: formatNumber(maxScore),
            })}
          </span>
        ) : null}
      </div>
      <FieldError errors={errors} />
    </Field>
  );
}
