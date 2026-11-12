import { EXPIRY_WARNING_DAYS } from "@faridalms/domain/identifiers";
import { addDays } from "@faridalms/domain/school";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { identifiersQuery } from "~/queries/identifiers";
import {
  removeIdentifier,
  revealIdentifier,
  saveIdentifier,
} from "~/server/identifiers";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { matching } from "./format";
import { COUNTRY_CODES, countryName } from "./regions";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof identifiersQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

interface ExpiryProps {
  row: Row;
  today: string;
}

function Expiry({ row, today }: ExpiryProps) {
  if (!row.expiresOn) return null;
  const date = formatDate(row.expiresOn);
  if (row.expiresOn < today)
    return <StatusText tone="danger">{m.identityExpired({ date })}</StatusText>;
  if (row.expiresOn <= addDays(today, EXPIRY_WARNING_DAYS))
    return (
      <StatusText tone="warning">{m.identityExpiresSoon({ date })}</StatusText>
    );
  return (
    <span className="text-muted-foreground">{m.identityExpires({ date })}</span>
  );
}

interface DocumentNumberProps {
  row: Row;
  canReveal: boolean;
}

function DocumentNumber({ row, canReveal }: DocumentNumberProps) {
  const [shown, setShown] = useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: () => revealIdentifier({ data: { id: row.id } }),
    onSuccess: (out) => setShown(out.number),
  });
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <bdi className="font-mono text-sm leading-5" dir="ltr">
        {shown ?? row.shown}
      </bdi>
      {row.sealed && canReveal ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 max-md:h-10"
          disabled={reveal.isPending}
          aria-label={shown ? m.identityHide() : m.identityShow()}
          onClick={() => (shown ? setShown(null) : reveal.mutate())}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {shown ? m.identityHide() : m.identityShow()}
        </Button>
      ) : null}
    </span>
  );
}

interface IdentitySheetProps {
  studentId: string;
  data: Data;
  row: Row | null;
  open: boolean;
  onClose: () => void;
}

function IdentitySheet({
  studentId,
  data,
  row,
  open,
  onClose,
}: IdentitySheetProps) {
  const queryClient = useQueryClient();
  const [systemId, setSystemId] = useState(
    row?.systemId ?? data.systems[0]?.id ?? "",
  );
  const [number, setNumber] = useState(
    row && !row.sealed ? (row.shown ?? "") : "",
  );
  const [country, setCountry] = useState(row?.issuingCountry ?? "");
  const [countrySearch, setCountrySearch] = useState("");
  const [validFrom, setValidFrom] = useState(row?.from ?? "");
  const [expiresOn, setExpiresOn] = useState(row?.expiresOn ?? "");
  const [checked, setChecked] = useState(false);
  const system = data.systems.find((item) => item.id === systemId);
  const keeps = row !== null && row.sealed;
  const mutation = useMutation({
    mutationFn: () =>
      saveIdentifier({
        data: {
          studentId,
          id: row?.id ?? "",
          expectedVersion: row?.version ?? 0,
          systemId,
          number: number.trim(),
          issuingCountry: country,
          validFrom,
          expiresOn,
        },
      }),
    meta: { inlineError: true },
  });
  const countries = COUNTRY_CODES.map((code) => ({
    value: code,
    label: countryName(code),
  }));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={row ? m.identityEditTitle() : m.identityAddTitle()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setChecked(true);
        if (!systemId || (!keeps && !number.trim())) return;
        await mutation.mutateAsync().then(
          async (out) => {
            await queryClient.invalidateQueries({
              queryKey: ["people", "student", studentId, "identifiers"],
            });
            if (out.birthDateDiffers) toast.warning(m.identityBirthDiffers());
            else toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="identity-system"
        label={m.identityKind()}
        value={systemId}
        options={data.systems.map((item) => ({
          value: item.id,
          label: inLocale(item.labelEn, item.labelAr),
        }))}
        onChange={setSystemId}
        disabled={row !== null}
        width="name"
      />
      <TextField
        id="identity-number"
        label={m.identityNumber()}
        hint={
          keeps
            ? m.identityNumberKeep()
            : system?.sealed
              ? m.identityNumberSealed()
              : undefined
        }
        optional={keeps}
        dir="ltr"
        width="reference"
        maxLength={64}
        autoComplete="off"
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        errors={
          checked && !keeps && !number.trim()
            ? [m.validationRequired()]
            : undefined
        }
      />
      {system?.sealed ? (
        <>
          <ComboboxField
            label={m.identityCountry()}
            optional
            clearable
            options={matching(countrySearch, countries)}
            value={country ? [country] : []}
            onChange={(next) => setCountry(next[0] ?? "")}
            search={countrySearch}
            onSearchChange={setCountrySearch}
          />
          <TextField
            id="identity-from"
            label={m.identityIssued()}
            optional
            type="date"
            width="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
          <TextField
            id="identity-expires"
            label={m.identityExpiresOn()}
            optional
            type="date"
            width="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
          />
        </>
      ) : null}
    </SheetForm>
  );
}

export interface IdentitySectionProps {
  studentId: string;
}

/**
 * The student's identity documents and the numbers other systems give them.
 * Document numbers are sealed and show masked; seeing one in full is a
 * separate permission and every look is recorded.
 */
export function IdentitySection({ studentId }: IdentitySectionProps) {
  const data = useSuspenseQuery(identifiersQuery(studentId)).data;
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{
    row: Row | null;
    open: boolean;
    key: number;
  }>({ row: null, open: false, key: 0 });
  const label = (row: Row) => {
    const system = data.systems.find((item) => item.id === row.systemId);
    return system ? inLocale(system.labelEn, system.labelAr) : row.meaning;
  };
  const edit = (row: Row | null) =>
    setSheet((current) => ({ row, open: true, key: current.key + 1 }));
  const remove = (row: Row) => async () => {
    try {
      await removeIdentifier({
        data: { id: row.id, expectedVersion: row.version },
      });
    } catch (error) {
      throw new Error(getMessageFromError(error), { cause: error });
    }
    await queryClient.invalidateQueries({
      queryKey: ["people", "student", studentId, "identifiers"],
    });
    toast.success(m.identityRemoved());
  };
  return (
    <>
      <RecordSection
        title={m.identityTitle()}
        description={m.identityHint()}
        action={
          data.canWrite ? (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => edit(null)}
            >
              <Plus aria-hidden />
              {m.identityAdd()}
            </Button>
          ) : undefined
        }
      >
        {data.rows.length === 0 ? (
          <RecordEmpty>{m.identityEmpty()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.rows.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {label(row)}
                  </span>
                  <DocumentNumber row={row} canReveal={data.canReveal} />
                  <span className="flex flex-wrap items-center gap-x-3 text-[13px] leading-[18px]">
                    {row.issuingCountry ? (
                      <span className="text-muted-foreground">
                        {m.identityIssuedBy({
                          country: countryName(row.issuingCountry),
                        })}
                      </span>
                    ) : null}
                    <Expiry row={row} today={data.today} />
                  </span>
                </div>
                {data.canWrite ? (
                  <ActionMenu
                    label={m.identityActions({ kind: label(row) })}
                    actions={[
                      {
                        label: m.identityEdit(),
                        icon: Pencil,
                        onSelect: () => edit(row),
                      },
                      {
                        label: m.identityRemove(),
                        icon: Trash2,
                        destructive: true,
                        confirm: {
                          title: m.identityRemoveTitle(),
                          body: m.identityRemoveBody(),
                          label: m.identityRemove(),
                        },
                        onSelect: remove(row),
                      },
                    ]}
                  />
                ) : null}
              </li>
            ))}
          </RecordList>
        )}
      </RecordSection>
      {data.canWrite ? (
        <IdentitySheet
          key={sheet.key}
          studentId={studentId}
          data={data}
          row={sheet.row}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
