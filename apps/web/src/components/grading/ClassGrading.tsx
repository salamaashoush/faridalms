import { SelectField } from "@faridalms/ui/system/form-field";
import { Fact, Facts, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import {
  classGradingQuery,
  classPlanQuery,
  gradingOverviewQuery,
} from "~/queries/grading";
import { setClassGrading } from "~/server/grading";
import { getMessageFromError } from "~/utils/error";

import type { GradingOverview } from "./Scales";

import { bandsLine, weightsLine } from "./format";
import { programmeDefaultWords } from "./slots";

const FOLLOW = "follow";

const title = (row: { titleEn: string | null; titleAr: string | null }) =>
  inLocale(row.titleEn, row.titleAr);

export interface ClassGradingSectionProps {
  classId: string;
  canEdit: boolean;
}

/**
 * The programme a class belongs to and the scale it grades on, each its
 * own or followed from the default, for the people who keep them.
 */
export function ClassGradingSection({
  classId,
  canEdit,
}: ClassGradingSectionProps) {
  const queryClient = useQueryClient();
  const words = useSlot(programmeDefaultWords)[0];
  const plan = useQuery(classPlanQuery(classId)).data;
  const overview = useQuery({ ...gradingOverviewQuery, enabled: canEdit }).data;
  const grading = useQuery({
    ...classGradingQuery(classId),
    enabled: canEdit,
  }).data;
  const [editing, setEditing] = useState<{ generation: number } | null>(null);
  const [open, setOpen] = useState(false);
  if (!plan) return null;
  const { programme, scale } = plan;
  return (
    <RecordSection
      title={m.gradingClassSection()}
      edit={
        canEdit && overview && grading
          ? {
              label: m.gradingClassEdit(),
              onClick: () => {
                setEditing((current) => ({
                  generation: (current?.generation ?? 0) + 1,
                }));
                setOpen(true);
              },
            }
          : undefined
      }
    >
      <Facts>
        <Fact label={m.gradingProgramme()}>
          {programme ? (
            <>
              <bdi>{title(programme)}</bdi>
              {programme.derived && words ? (
                <span className="text-muted-foreground">
                  {" "}
                  {words.derived()}
                </span>
              ) : null}
            </>
          ) : (
            m.gradingNoProgramme()
          )}
        </Fact>
        <Fact label={m.gradingScale()}>
          {scale ? (
            <span className="grid gap-0.5">
              <span>
                <bdi>{title(scale)}</bdi>
                {scale.own ? null : (
                  <span className="text-muted-foreground">
                    {" "}
                    {m.gradingFromProgramme()}
                  </span>
                )}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {bandsLine(scale.bands)}
              </span>
            </span>
          ) : (
            m.gradingPointsOnly()
          )}
        </Fact>
        {plan.categories.length ? (
          <Fact label={m.gradingCategories()}>
            {weightsLine(plan.categories)}
          </Fact>
        ) : null}
      </Facts>
      {editing && overview && grading ? (
        <ClassGradingSheet
          key={editing.generation}
          open={open}
          classId={classId}
          programmeId={grading.programmeId}
          scaleId={grading.scaleId}
          overview={overview}
          onClose={() => setOpen(false)}
          onSaved={() =>
            queryClient.invalidateQueries({ queryKey: ["grading"] })
          }
        />
      ) : null}
    </RecordSection>
  );
}

interface ClassGradingSheetProps {
  open: boolean;
  classId: string;
  programmeId: string | null;
  scaleId: string | null;
  overview: GradingOverview;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}

function ClassGradingSheet({
  open,
  classId,
  programmeId,
  scaleId,
  overview,
  onClose,
  onSaved,
}: ClassGradingSheetProps) {
  const words = useSlot(programmeDefaultWords)[0];
  const [programme, setProgramme] = useState(programmeId ?? FOLLOW);
  const [scale, setScale] = useState(scaleId ?? FOLLOW);
  const mutation = useMutation({
    mutationFn: () =>
      setClassGrading({
        data: {
          classId,
          programmeId: programme === FOLLOW ? null : programme,
          scaleId: scale === FOLLOW ? null : scale,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.gradingClassEdit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await onSaved();
        toast.success(m.managementSaved());
        onClose();
      }}
    >
      <SelectField
        id="class-programme"
        label={m.gradingProgramme()}
        hint={words?.hint()}
        value={programme}
        options={[
          {
            value: FOLLOW,
            label: words ? words.option() : m.gradingNoProgramme(),
          },
          ...overview.programmes.map((row) => ({
            value: row.id,
            label: title(row),
          })),
        ]}
        onChange={setProgramme}
      />
      <SelectField
        id="class-scale"
        label={m.gradingScale()}
        hint={m.gradingClassScaleHint()}
        value={scale}
        options={[
          { value: FOLLOW, label: m.gradingFromProgrammeOption() },
          ...overview.scales.map((row) => ({
            value: row.id,
            label: title(row),
          })),
        ]}
        onChange={setScale}
      />
    </SheetForm>
  );
}
