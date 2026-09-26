import type { SchoolYearStatus } from "@faridalms/domain/academic-year";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldLabel } from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  setAcademicYearStatus,
  setDefaultAcademicYear,
} from "~/server/academic-years";
import { getMessageFromError } from "~/utils/error";

import { ManagementDialog } from "./ManagementDialog";

export const YEAR_STATUS_LABEL: Record<SchoolYearStatus, () => string> = {
  planning: m.academicYearPlanning,
  active: m.academicYearActive,
  closed: m.academicYearClosed,
};

interface Year {
  id: string;
  name: string;
  status: SchoolYearStatus;
  isCurrent: boolean;
  revision: number;
}

export function YearLifecycle({ year }: { year: Year }) {
  const queryClient = useQueryClient();
  const canReopen = useCapability("years:reopen");
  const [dialog, setDialog] = useState<"close" | "reopen">();
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string>();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    await queryClient.invalidateQueries({ queryKey: ["school"] });
  };
  const status = useMutation({
    mutationFn: (next: { status: SchoolYearStatus; reason?: string }) =>
      setAcademicYearStatus({
        data: {
          id: year.id,
          expectedRevision: year.revision,
          status: next.status,
          reason: next.reason ?? "",
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.managementSaved());
      setDialog(undefined);
      setReason("");
    },
    onError: (error) => {
      const message = getMessageFromError(error);
      if (dialog) setFailure(message);
      else toast.error(message);
    },
  });
  const makeDefault = useMutation({
    mutationFn: () =>
      setDefaultAcademicYear({
        data: { id: year.id, expectedRevision: year.revision },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.academicYearDefaultChanged({ name: year.name }));
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const pending = status.isPending || makeDefault.isPending;
  return (
    <div className="flex flex-wrap gap-2">
      {year.status === "planning" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => status.mutate({ status: "active" })}
        >
          {m.academicYearActivate()}
        </Button>
      ) : null}
      {year.status === "active" && !year.isCurrent ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => makeDefault.mutate()}
          >
            {m.academicYearMakeDefault()}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setFailure(undefined);
              setDialog("close");
            }}
          >
            {m.academicYearClose()}
          </Button>
        </>
      ) : null}
      {year.status === "closed" && canReopen ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setFailure(undefined);
            setDialog("reopen");
          }}
        >
          {m.academicYearReopen()}
        </Button>
      ) : null}
      {dialog === "close" ? (
        <ManagementDialog
          title={m.academicYearCloseTitle({ name: year.name })}
          description={m.academicYearCloseHint()}
          pending={status.isPending}
          submitLabel={m.academicYearClose()}
          onClose={() => setDialog(undefined)}
          onSubmit={() => status.mutate({ status: "closed" })}
        >
          {failure ? (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          ) : null}
        </ManagementDialog>
      ) : null}
      {dialog === "reopen" ? (
        <ManagementDialog
          title={m.academicYearReopenTitle({ name: year.name })}
          description={m.academicYearReopenHint()}
          pending={status.isPending}
          submitLabel={m.academicYearReopen()}
          onClose={() => setDialog(undefined)}
          onSubmit={() => status.mutate({ status: "active", reason })}
        >
          <Field>
            <FieldLabel htmlFor={`reopen-${year.id}`}>
              {m.academicYearReopenReason()}
            </FieldLabel>
            <Textarea
              id={`reopen-${year.id}`}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              {m.academicYearReopenReasonHint()}
            </FieldDescription>
          </Field>
          {failure ? (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          ) : null}
        </ManagementDialog>
      ) : null}
    </div>
  );
}
