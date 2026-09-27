import type {
  AudienceInput,
  AudienceScope,
} from "@faridalms/domain/announcements";

import { AUDIENCE_SCOPES } from "@faridalms/domain/announcements";
import { Plus, X } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import { SelectField } from "~/components/system/field";
import { Button } from "~/components/ui/button";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { SCOPE_LABEL } from "./format";

export interface AudienceChoices {
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  }[];
  grades: { id: string; labelEn: string | null; labelAr: string | null }[];
}

export const MAX_AUDIENCES = 20;

export function audienceIssue(audiences: AudienceInput[]): string | null {
  return audiences.some(
    (row) =>
      (row.scope === "class" && !row.classId) ||
      (row.scope === "grade" && !row.gradeId),
  )
    ? m.annAudienceTarget()
    : null;
}

/** Who a broadcast goes to: the whole school, a group of people, classes or grades. */
export function AudienceList({
  value,
  onChange,
  choices,
  error,
}: {
  value: AudienceInput[];
  onChange: (next: AudienceInput[]) => void;
  choices: AudienceChoices;
  error: string | null;
}) {
  const setAt = (index: number, next: AudienceInput) =>
    onChange(value.map((row, at) => (at === index ? next : row)));
  return (
    <div className="grid gap-3">
      {value.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <SelectField
            id={`audience-${index}-scope`}
            label={m.annAudience()}
            labelHidden={index > 0}
            width="name"
            className="w-48"
            value={row.scope}
            options={AUDIENCE_SCOPES.map((scope) => ({
              value: scope,
              label: SCOPE_LABEL[scope](),
            }))}
            onChange={(scope: AudienceScope) =>
              setAt(index, { scope, classId: "", gradeId: "" })
            }
          />
          {row.scope === "class" ? (
            <SelectField
              id={`audience-${index}-class`}
              label={m.annClass()}
              labelHidden={index > 0}
              width="name"
              className="w-48"
              value={row.classId}
              options={[
                { value: "", label: m.annPickClass() },
                ...choices.classes.map((item) => ({
                  value: item.id,
                  label: classTitle(item),
                })),
              ]}
              onChange={(classId) => setAt(index, { ...row, classId })}
            />
          ) : row.scope === "grade" ? (
            <SelectField
              id={`audience-${index}-grade`}
              label={m.annGrade()}
              labelHidden={index > 0}
              width="name"
              className="w-48"
              value={row.gradeId}
              options={[
                { value: "", label: m.annPickGrade() },
                ...choices.grades.map((item) => ({
                  value: item.id,
                  label: inLocale(item.labelEn, item.labelAr),
                })),
              ]}
              onChange={(gradeId) => setAt(index, { ...row, gradeId })}
            />
          ) : null}
          {value.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="max-md:size-10"
              aria-label={m.annRemoveAudience()}
              onClick={() => onChange(value.filter((_, at) => at !== index))}
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {error}
        </p>
      ) : null}
      {value.length < MAX_AUDIENCES ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() =>
              onChange([...value, { scope: "class", classId: "", gradeId: "" }])
            }
          >
            <Plus aria-hidden />
            {m.annAddAudience()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
