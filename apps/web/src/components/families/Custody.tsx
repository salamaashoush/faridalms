import type { FileSummary } from "@faridalms/domain/file";

import { linkRefusal } from "@faridalms/domain/family-roles";
import { MAX_FILE_BYTES } from "@faridalms/domain/file";
import { Button } from "@faridalms/ui/button";
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
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { displayName } from "~/components/people/format";
import { FileField } from "~/components/system/FileField";
import { FileList } from "~/components/system/FileList";
import * as m from "~/i18n/messages";
import { custodyQuery } from "~/queries/families";
import {
  attachCourtOrder,
  removeCourtOrder,
  saveCustody,
} from "~/server/families";
import { getMessageFromError } from "~/utils/error";

function useRefresh(studentId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: ["people", "student", studentId],
    });
}

function openSheet<T>(
  set: (
    update: (current: { value: T | null; open: boolean; key: number }) => {
      value: T | null;
      open: boolean;
      key: number;
    },
  ) => void,
  value: T | null,
) {
  set((current) => ({ value, open: true, key: current.key + 1 }));
}

// --- custody --------------------------------------------------------------------

type Custody = Awaited<
  ReturnType<NonNullable<ReturnType<typeof custodyQuery>["queryFn"]>>
>;
type CustodyLink = Custody["links"][number];

const RIGHTS_LABEL: Record<CustodyLink["educationalRights"], () => string> = {
  full: m.custodyRightsFull,
  restricted: m.custodyRightsRestricted,
  none: m.custodyRightsNone,
};

const PICKUP_LABEL: Record<
  "allowed" | "not_allowed" | "ask_office",
  () => string
> = {
  allowed: m.custodyPickupAllowed,
  not_allowed: m.custodyPickupNotAllowed,
  ask_office: m.custodyPickupAskOffice,
};

interface CustodySheetProps {
  studentId: string;
  link: CustodyLink;
  open: boolean;
  onClose: () => void;
}

function CustodySheet({ studentId, link, open, onClose }: CustodySheetProps) {
  const refresh = useRefresh(studentId);
  const [rights, setRights] = useState(link.educationalRights);
  const [rightsError, setRightsError] = useState<string | null>(null);
  const [isolated, setIsolated] = useState(link.communicationIsolated);
  const [pickup, setPickup] = useState(link.pickup);
  const [restrictions, setRestrictions] = useState(
    link.contactRestrictions ?? "",
  );
  const [order, setOrder] = useState<FileSummary[]>(
    link.courtOrder
      ? [
          {
            id: link.courtOrder.fileId,
            name: link.courtOrder.name,
            mediaType: link.courtOrder.mediaType,
            sizeBytes: link.courtOrder.sizeBytes,
          },
        ]
      : [],
  );
  const mutation = useMutation({
    mutationFn: async () => {
      await saveCustody({
        data: {
          studentId,
          relationshipId: link.relationshipId,
          expectedVersion: link.version,
          contactRestrictions: restrictions,
          educationalRights: rights,
          communicationIsolated: isolated,
          pickup,
        },
      });
      const kept = order[0];
      if (kept?.id === (link.courtOrder?.fileId ?? undefined)) return;
      const which = { studentId, relationshipId: link.relationshipId };
      await (kept
        ? attachCourtOrder({
            data: { ...which, order: { fileId: kept.id, name: kept.name } },
          })
        : removeCourtOrder({ data: which }));
    },
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.custodyEditFor({ name: displayName(link) })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        const refused = linkRefusal(link.relationMeaning, {
          portalAccess: link.portalAccess,
          educationalRights: rights,
          accessBasis: link.accessBasis,
        });
        const said = refused ? getMessageFromError({ message: refused }) : null;
        setRightsError(said);
        if (said) return;
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
      <SelectField
        id="custody-pickup"
        label={m.guardianPickup()}
        value={pickup ?? "unknown"}
        options={[
          { value: "allowed", label: m.guardianPickupAllowed() },
          { value: "not_allowed", label: m.guardianPickupNotAllowed() },
          { value: "ask_office", label: m.guardianPickupAskOffice() },
          { value: "unknown", label: m.commonNotRecorded() },
        ]}
        onChange={(value) =>
          setPickup(
            value === "allowed" ||
              value === "not_allowed" ||
              value === "ask_office"
              ? value
              : null,
          )
        }
        width="name"
      />
      <SelectField
        id="custody-rights"
        label={m.custodyRights()}
        hint={m.custodyRightsHint()}
        value={rights}
        options={[
          { value: "full", label: m.custodyRightsFull() },
          { value: "restricted", label: m.custodyRightsRestricted() },
          { value: "none", label: m.custodyRightsNone() },
        ]}
        onChange={(value) => {
          setRightsError(null);
          setRights(
            value === "restricted" || value === "none" ? value : "full",
          );
        }}
        errors={rightsError ? [rightsError] : undefined}
        width="name"
      />
      <CheckboxRow
        label={m.custodyIsolated()}
        hint={m.custodyIsolatedHint()}
        checked={isolated}
        onChange={setIsolated}
      />
      <TextField
        id="custody-restrictions"
        label={m.custodyRestrictions()}
        hint={m.custodyRestrictionsHint()}
        optional
        width="full"
        maxLength={250}
        autoComplete="off"
        value={restrictions}
        onChange={(event) => setRestrictions(event.target.value)}
      />
      <FileField
        id="custody-order"
        label={m.custodyOrder()}
        hint={m.custodyOrderHint()}
        purpose="legal_document"
        value={order}
        onChange={setOrder}
        maxFiles={1}
        maxBytes={MAX_FILE_BYTES}
        optional
      />
    </SheetForm>
  );
}

export interface CustodySectionProps {
  studentId: string;
}

export function CustodySection({ studentId }: CustodySectionProps) {
  const data = useSuspenseQuery(custodyQuery(studentId)).data;
  const [sheet, setSheet] = useState<{
    value: CustodyLink | null;
    open: boolean;
    key: number;
  }>({
    value: null,
    open: false,
    key: 0,
  });
  return (
    <>
      <RecordSection title={m.custodyTitle()} description={m.custodyHint()}>
        {data.links.length === 0 ? (
          <RecordEmpty>{m.studentNoGuardians()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.links.map((link) => {
              const flagged =
                link.pickup === "not_allowed" ||
                link.educationalRights !== "full" ||
                link.communicationIsolated;
              return (
                <li
                  key={link.relationshipId}
                  className="flex items-start gap-3 py-3"
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span dir="auto" className="text-sm leading-5 font-medium">
                      {displayName(link)}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-[13px] leading-[18px]">
                      <StatusText tone={flagged ? "warning" : "neutral"}>
                        {link.pickup
                          ? PICKUP_LABEL[link.pickup]()
                          : m.custodyPickupUnknown()}
                      </StatusText>
                      <span className="text-muted-foreground">
                        {RIGHTS_LABEL[link.educationalRights]()}
                      </span>
                      {link.communicationIsolated ? (
                        <span className="text-muted-foreground">
                          {m.custodyIsolatedShort()}
                        </span>
                      ) : null}
                    </span>
                    {link.contactRestrictions ? (
                      <span className="text-sm leading-5">
                        <bdi>{link.contactRestrictions}</bdi>
                      </span>
                    ) : null}
                    {link.courtOrder ? (
                      <div className="mt-1.5">
                        <FileList
                          files={[
                            {
                              id: link.courtOrder.fileId,
                              name: link.courtOrder.name,
                              mediaType: link.courtOrder.mediaType,
                              sizeBytes: link.courtOrder.sizeBytes,
                            },
                          ]}
                        />
                      </div>
                    ) : null}
                  </div>
                  {data.canWrite ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-10"
                      aria-label={m.custodyEditFor({ name: displayName(link) })}
                      onClick={() => openSheet(setSheet, link)}
                    >
                      <Pencil aria-hidden />
                      {m.recordEdit()}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </RecordList>
        )}
      </RecordSection>
      {data.canWrite && sheet.value ? (
        <CustodySheet
          key={sheet.key}
          studentId={studentId}
          link={sheet.value}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
