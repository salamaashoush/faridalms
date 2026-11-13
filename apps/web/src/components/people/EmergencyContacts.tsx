import {
  CALL_ORDER_MAX,
  saveEmergencyContactSchema,
} from "@faridalms/domain/emergency-contacts";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import {
  FormField,
  NumberField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { emergencyContactsQuery } from "~/queries/emergency-contacts";
import {
  removeEmergencyContact,
  saveEmergencyContact,
} from "~/server/emergency-contacts";
import { formatNumber } from "~/utils/datetime";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import { displayName, formatPhone, labelOf } from "./format";
import { Email, Phone } from "./record-parts";

type Listed = Awaited<
  ReturnType<NonNullable<ReturnType<typeof emergencyContactsQuery>["queryFn"]>>
>;
type Contact = Listed["contacts"][number];

type Field =
  | "name"
  | "relationship"
  | "phone"
  | "otherPhone"
  | "email"
  | "callOrder"
  | "notes";

const FIELDS = new Set<string>([
  "name",
  "relationship",
  "phone",
  "otherPhone",
  "email",
  "callOrder",
  "notes",
]);

const isField = (key: string): key is Field => FIELDS.has(key);

interface Draft {
  name: string;
  relationship: string;
  phone: string;
  otherPhone: string;
  email: string;
  callOrder: number | null;
  notes: string;
}

function draftOf(contact: Contact | null, next: number): Draft {
  return {
    name: contact?.fullNameEn ?? "",
    relationship: contact?.relation?.labelEn ?? "",
    phone: contact?.phone ? formatPhone(contact.phone) : "",
    otherPhone: contact?.otherPhone ? formatPhone(contact.otherPhone) : "",
    email: contact?.email ?? "",
    callOrder: contact?.order ?? next,
    notes: contact?.notes ?? "",
  };
}

interface ContactSheetProps {
  personId: string;
  contact: Contact | null;
  next: number;
  onClose: () => void;
}

function ContactSheet({ personId, contact, next, onClose }: ContactSheetProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => draftOf(contact, next));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const input = {
    personId,
    ...(contact?.version
      ? { id: contact.id, expectedVersion: contact.version }
      : {}),
    ...draft,
    callOrder: draft.callOrder ?? Number.NaN,
  };
  const mutation = useMutation({
    mutationFn: () => saveEmergencyContact({ data: input }),
    meta: { inlineError: true },
  });
  const refusal = refusalOf(mutation.error, {
    "contact_point.phone_invalid": "phone",
  });
  const shown = { ...errors };
  if (refusal?.field && !shown[refusal.field])
    shown[refusal.field] = refusal.message;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setErrors(({ [key]: _gone, ...rest }) => rest);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const issue = (field: Field) => (shown[field] ? [shown[field]] : undefined);
  return (
    <SheetForm
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        contact ? m.emergencyContactSheetEdit() : m.emergencyContactSheetAdd()
      }
      submitLabel={m.commonSave()}
      pending={mutation.isPending}
      error={refusal && !refusal.field ? refusal.message : null}
      onSubmit={async () => {
        const found = schemaErrors(saveEmergencyContactSchema, input, (key) =>
          isField(key) ? key : undefined,
        );
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({
              queryKey: emergencyContactsQuery(personId).queryKey,
            });
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="emergency-contact-name"
        label={m.emergencyContactName()}
        dir="auto"
        width="name"
        autoComplete="off"
        maxLength={160}
        value={draft.name}
        errors={issue("name")}
        onChange={(event) => set("name", event.target.value)}
      />
      <TextField
        id="emergency-contact-relationship"
        label={m.emergencyContactRelationship()}
        hint={m.emergencyContactRelationshipHint()}
        optional
        dir="auto"
        width="name"
        autoComplete="off"
        maxLength={80}
        value={draft.relationship}
        errors={issue("relationship")}
        onChange={(event) => set("relationship", event.target.value)}
      />
      <TextField
        id="emergency-contact-phone"
        label={m.emergencyContactPhone()}
        type="tel"
        dir="ltr"
        width="phone"
        autoComplete="off"
        value={draft.phone}
        errors={issue("phone")}
        onChange={(event) => set("phone", event.target.value)}
      />
      <TextField
        id="emergency-contact-other-phone"
        label={m.emergencyContactOtherPhone()}
        optional
        type="tel"
        dir="ltr"
        width="phone"
        autoComplete="off"
        value={draft.otherPhone}
        errors={issue("otherPhone")}
        onChange={(event) => set("otherPhone", event.target.value)}
      />
      <TextField
        id="emergency-contact-email"
        label={m.emergencyContactEmail()}
        optional
        type="email"
        dir="ltr"
        width="name"
        autoComplete="off"
        value={draft.email}
        errors={issue("email")}
        onChange={(event) => set("email", event.target.value)}
      />
      <NumberField
        id="emergency-contact-order"
        label={m.emergencyContactOrder()}
        hint={m.emergencyContactOrderHint()}
        value={draft.callOrder}
        errors={issue("callOrder")}
        onChange={(value) => set("callOrder", value)}
      />
      <FormField
        id="emergency-contact-notes"
        label={m.emergencyContactNotes()}
        optional
        errors={issue("notes")}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

export interface EmergencyContactsSectionProps {
  personId: string;
}

/**
 * Who the school calls about a learner, in the order it calls them: the
 * learner's own contacts, which whoever may change them changes here, and
 * those a module marks, which change where that module keeps them.
 */
export function EmergencyContactsSection({
  personId,
}: EmergencyContactsSectionProps) {
  const queryClient = useQueryClient();
  const { edits, contacts } = useSuspenseQuery(
    emergencyContactsQuery(personId),
  ).data;
  const [editing, setEditing] = useState<{
    contact: Contact | null;
    key: number;
  } | null>(null);
  const removal = useMutation({
    mutationFn: (contact: Contact) =>
      removeEmergencyContact({
        data: {
          personId,
          id: contact.id,
          expectedVersion: contact.version ?? 0,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: emergencyContactsQuery(personId).queryKey,
      }),
  });
  const next = Math.min(
    CALL_ORDER_MAX,
    Math.max(0, ...contacts.map((contact) => contact.order ?? 0)) + 1,
  );
  return (
    <RecordSection
      title={m.emergencyContactsTitle()}
      description={m.emergencyContactsHint()}
      action={
        edits ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={() =>
              setEditing((current) => ({
                contact: null,
                key: (current?.key ?? 0) + 1,
              }))
            }
          >
            <Plus aria-hidden />
            {m.emergencyContactsAdd()}
          </Button>
        ) : undefined
      }
    >
      {contacts.length === 0 ? (
        <RecordEmpty>{m.emergencyContactsNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {contacts.map((contact, index) => {
            const name = displayName(contact);
            const relation = labelOf(contact.relation);
            return (
              <li key={contact.id} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
                >
                  {formatNumber(index + 1)}
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    <bdi>{name}</bdi>
                    {relation ? (
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        <bdi>{relation}</bdi>
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] leading-[18px]">
                    <Phone value={contact.phone} />
                    {contact.otherPhone ? (
                      <Phone value={contact.otherPhone} />
                    ) : null}
                    {contact.email ? <Email value={contact.email} /> : null}
                  </span>
                  {contact.notes ? (
                    <p
                      dir="auto"
                      className="text-[13px] leading-[18px] break-words text-muted-foreground"
                    >
                      {contact.notes}
                    </p>
                  ) : null}
                </div>
                {edits && contact.own ? (
                  <ActionMenu
                    label={m.emergencyContactActions({ name })}
                    actions={[
                      {
                        label: m.emergencyContactEdit(),
                        icon: Pencil,
                        onSelect: () =>
                          setEditing((current) => ({
                            contact,
                            key: (current?.key ?? 0) + 1,
                          })),
                      },
                      {
                        label: m.emergencyContactRemove(),
                        icon: Trash2,
                        destructive: true,
                        confirm: {
                          title: m.emergencyContactRemoveTitle({ name }),
                          body: m.emergencyContactRemoveBody(),
                          label: m.emergencyContactRemove(),
                        },
                        onSelect: () => removal.mutateAsync(contact),
                      },
                    ]}
                  />
                ) : null}
              </li>
            );
          })}
        </RecordList>
      )}
      {editing ? (
        <ContactSheet
          key={editing.key}
          personId={personId}
          contact={editing.contact}
          next={next}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </RecordSection>
  );
}
