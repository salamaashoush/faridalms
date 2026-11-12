import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { peopleOptionsQuery } from "~/queries/students";
import { saveStudent } from "~/server/students";
import { getMessageFromError } from "~/utils/error";

import type { NamesDraft } from "./fields";
import type { StudentData } from "./StudentRecord";

import { hasName, NameFields, namesFrom, namesInput } from "./fields";
import { labelOf } from "./format";

function useRefresh(studentId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["people", "student", studentId],
      }),
      queryClient.invalidateQueries({ queryKey: ["people", "students"] }),
    ]);
}

interface PersonalSheetProps {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}

function PersonalSheet({ student, open, onClose }: PersonalSheetProps) {
  const sexes = useSuspenseQuery(peopleOptionsQuery).data.sexes.map((row) => ({
    value: row.id,
    label: labelOf(row) ?? row.code,
  }));
  const refresh = useRefresh(student.id);
  const [names, setNames] = useState<NamesDraft>(() => namesFrom(student));
  const [preferred, setPreferred] = useState(student.preferredGivenName ?? "");
  const [birthDate, setBirthDate] = useState(student.birthDate ?? "");
  const [sexId, setSexId] = useState(student.sexId ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveStudent({
        data: {
          id: student.id,
          expectedVersion: student.version,
          names: namesInput(names),
          preferredName: preferred,
          reference: student.reference ?? "",
          birthDate,
          sexId,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentEditPersonal()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!hasName(names)) {
          setNameError(m.validationNameRequired());
          return;
        }
        setNameError(null);
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <NameFields
        idPrefix="sheet"
        value={names}
        onChange={setNames}
        error={nameError}
      />
      <TextField
        id="sheet-preferred"
        label={m.peoplePreferredName()}
        optional
        width="name"
        value={preferred}
        onChange={(event) => setPreferred(event.target.value)}
      />
      <TextField
        id="sheet-birth-date"
        label={m.studentBirthdate()}
        optional
        type="date"
        width="date"
        value={birthDate}
        onChange={(event) => setBirthDate(event.target.value)}
      />
      <SelectField
        id="sheet-sex"
        label={m.peopleSex()}
        optional
        value={sexId || "none"}
        options={[...sexes, { value: "none", label: m.commonNotRecorded() }]}
        onChange={(value) => setSexId(value === "none" ? "" : value)}
        width="name"
      />
    </SheetForm>
  );
}

export interface StudentSheetsProps {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}

/** The sheet the student record opens over itself for the student's personal details. */
export function StudentSheets({ student, open, onClose }: StudentSheetsProps) {
  return <PersonalSheet student={student} open={open} onClose={onClose} />;
}
