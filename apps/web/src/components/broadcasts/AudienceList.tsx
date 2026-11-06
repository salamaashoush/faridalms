import type {
  AudienceInput,
  AudienceScope,
} from "@faridalms/domain/announcements";

import { AUDIENCE_SCOPES } from "@faridalms/domain/announcements";
import { Button } from "@faridalms/ui/button";
import { SelectField } from "@faridalms/ui/system/form-field";
import { Plus, X } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatList } from "~/utils/datetime";

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

/** Who a draft reaches, named in a line; rows still missing a class or grade are left out. */
export function audienceSummary(
  audiences: AudienceInput[],
  choices: AudienceChoices,
): string {
  return formatList(
    audiences.flatMap((row) => {
      if (row.scope === "class") {
        const found = choices.classes.find((item) => item.id === row.classId);
        return found ? [classTitle(found)] : [];
      }
      if (row.scope === "grade") {
        const found = choices.grades.find((item) => item.id === row.gradeId);
        return found ? [inLocale(found.labelEn, found.labelAr)] : [];
      }
      return [SCOPE_LABEL[row.scope]()];
    }),
  );
}

export function audienceIssue(audiences: AudienceInput[]): string | null {
  return audiences.some(
    (row) =>
      (row.scope === "class" && !row.classId) ||
      (row.scope === "grade" && !row.gradeId),
  )
    ? m.annAudienceTarget()
    : null;
}

export interface AudienceListProps {
  value: AudienceInput[];
  onChange: (next: AudienceInput[]) => void;
  choices: AudienceChoices;
  error: string | null;
  /** The scopes this author may address; teachers reach only their classes. */
  scopes?: readonly AudienceScope[];
}

/** Who a broadcast goes to: the whole school, a group of people, classes or grades. */
export function AudienceList({
  value,
  onChange,
  choices,
  error,
  scopes = AUDIENCE_SCOPES,
}: AudienceListProps) {
  const setAt = (index: number, next: AudienceInput) =>
    onChange(value.map((row, at) => (at === index ? next : row)));
  return (
    <div className="grid gap-3">
      {value.map((row, index) => (
        <div
          key={index}
          className={
            value.length > 1
              ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
              : "grid"
          }
        >
          <div className="grid gap-2">
            <SelectField
              id={`audience-${index}-scope`}
              label={m.annAudienceNumber({ number: index + 1 })}
              labelHidden
              value={row.scope}
              options={scopes.map((scope) => ({
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
                labelHidden
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
                labelHidden
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
          </div>
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
            variant="ghost"
            size="sm"
            className="-ms-2 max-md:h-10"
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
