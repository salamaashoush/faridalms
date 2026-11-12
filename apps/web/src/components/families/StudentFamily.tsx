import type { ReactNode } from "react";

import { linkRefusal } from "@faridalms/domain/family-roles";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Contact, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { NamesDraft } from "~/components/people/fields";

import { KIND_ICON, noticeText } from "~/components/notifications/format";
import { ContactsSheet } from "~/components/people/ContactsSheet";
import {
  EMPTY_NAMES,
  hasName,
  NameFields,
  namesInput,
} from "~/components/people/fields";
import { displayName, labelOf } from "~/components/people/format";
import { Deferred, Email, Phone } from "~/components/people/record-parts";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  guardianNoticesQuery,
  guardiansQuery,
  relationsQuery,
  siblingsQuery,
} from "~/queries/families";
import { endRelationship, saveRelationship } from "~/server/families";
import { findByContact } from "~/server/students";
import { formatInstant, formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { FlagsDraft } from "./fields";

import { CustodySection } from "./Custody";
import { PARENT_FLAGS, RelationshipFields } from "./fields";

type Guardian = Awaited<
  ReturnType<NonNullable<ReturnType<typeof guardiansQuery>["queryFn"]>>
>["guardians"][number];

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

/** Ends a guardian link from the record's menu; the menu has confirmed it. */
export function useEndLink(studentId: string) {
  const refresh = useRefresh(studentId);
  return async (guardian: Guardian, studentName: string) => {
    await endRelationship({
      data: {
        relationshipId: guardian.relationshipId,
        expectedVersion: guardian.version,
      },
    });
    await refresh();
    toast.success(
      m.guardianLinkEnded({
        name: displayName(guardian),
        student: studentName,
      }),
    );
  };
}

function choices(
  list: {
    id: string;
    labelEn: string | null;
    labelAr: string | null;
    code: string;
  }[],
) {
  return list.map((row) => ({
    value: row.id,
    label: labelOf(row) ?? row.code,
  }));
}

function useOptions() {
  const relations = useSuspenseQuery(relationsQuery).data;
  return {
    relations: choices(relations),
    relationByCode: (code: string) =>
      relations.find((row) => row.code === code)?.id ?? "",
    meaningOf: (id: string) =>
      relations.find((row) => row.id === id)?.meaning ?? null,
  };
}

/** Why the cell would refuse this link, said on its family app access. */
function portalRefusal(
  meaning: string | null,
  link: Parameters<typeof linkRefusal>[1],
) {
  const refused = linkRefusal(meaning, link);
  return refused ? getMessageFromError({ message: refused }) : null;
}

function flagsOf(guardian: Guardian): FlagsDraft {
  return {
    relationId: guardian.relationId,
    legalGuardian: guardian.legalGuardian,
    portalAccess: guardian.portalAccess,
    receivesNotifications: guardian.receivesNotifications,
    primaryContact: guardian.primaryContact,
    emergencyContact: guardian.emergencyContact,
    residence: guardian.residence,
    pickup: guardian.pickup,
  };
}

interface GuardianSheetProps {
  student: { id: string };
  guardian: Guardian;
  open: boolean;
  onClose: () => void;
}

function GuardianSheet({
  student,
  guardian,
  open,
  onClose,
}: GuardianSheetProps) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const [flags, setFlags] = useState<FlagsDraft>(() => flagsOf(guardian));
  const [portalError, setPortalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveRelationship({
        data: {
          studentId: student.id,
          relationshipId: guardian.relationshipId,
          expectedVersion: guardian.version,
          flags,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.guardianEditTitle({ name: displayName(guardian) })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        const refused = portalRefusal(options.meaningOf(flags.relationId), {
          portalAccess: flags.portalAccess,
          educationalRights: guardian.educationalRights,
          accessBasis: guardian.accessBasis,
        });
        setPortalError(refused);
        if (refused) return;
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
      <RelationshipFields
        idPrefix="guardian"
        value={flags}
        onChange={(next) => {
          setPortalError(null);
          setFlags(next);
        }}
        relations={options.relations}
        portalError={portalError}
      />
    </SheetForm>
  );
}

type Match = Awaited<ReturnType<typeof findByContact>>[number];

interface AddGuardianSheetProps {
  student: { id: string };
  open: boolean;
  onClose: () => void;
}

/**
 * Adds a guardian. The phone or email comes first, so someone the school
 * already holds is linked rather than created a second time; a person known
 * only at another school of the group shows as a minimal card.
 */
function AddGuardianSheet({ student, open, onClose }: AddGuardianSheetProps) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [choice, setChoice] = useState<string>("new");
  const [names, setNames] = useState<NamesDraft>(EMPTY_NAMES);
  const linked = useSuspenseQuery(guardiansQuery(student.id)).data.guardians;
  const [flags, setFlags] = useState<FlagsDraft>({
    ...PARENT_FLAGS,
    primaryContact: linked.length === 0,
    relationId: options.relationByCode("mother"),
  });
  const [errors, setErrors] = useState<{
    names?: string;
    contact?: string;
    portal?: string;
  }>({});
  const [looking, setLooking] = useState(false);
  const lookUp = async () => {
    if (!phone.trim() && !email.trim()) {
      setErrors({ contact: m.guardianContactRequired() });
      return;
    }
    setErrors({});
    setLooking(true);
    try {
      const found = await findByContact({ data: { phone, email } });
      setMatches(found);
      setChoice(found[0]?.id ?? "new");
    } finally {
      setLooking(false);
    }
  };
  const mutation = useMutation({
    mutationFn: () =>
      saveRelationship({
        data: {
          studentId: student.id,
          ...(choice === "new"
            ? { person: { names: namesInput(names), phone, email } }
            : { existingUserId: choice }),
          flags,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.guardianAdd()}
      pending={mutation.isPending || looking}
      submitLabel={matches === null ? m.guardianFind() : m.guardianAdd()}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (matches === null) {
          await lookUp();
          return;
        }
        const found: typeof errors = {};
        if (choice === "new" && !hasName(names))
          found.names = m.validationNameRequired();
        // A new link starts with full rights on the parents' authority.
        const refused = portalRefusal(options.meaningOf(flags.relationId), {
          portalAccess: flags.portalAccess,
          educationalRights: "full",
          accessBasis: "parental_authority",
        });
        if (refused) found.portal = refused;
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.guardianAdded());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.guardianFindHint()}
      </p>
      <TextField
        id="guardian-phone"
        label={m.familyMobile()}
        type="tel"
        dir="ltr"
        width="phone"
        autoComplete="off"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
          setMatches(null);
        }}
        errors={errors.contact ? [errors.contact] : undefined}
      />
      <TextField
        id="guardian-email"
        label={m.studentEmail()}
        type="email"
        dir="ltr"
        optional
        width="name"
        autoComplete="off"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setMatches(null);
        }}
      />
      {matches === null ? null : (
        <>
          {matches.length > 0 ? (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm leading-5 font-semibold">
                {m.guardianMatches()}
              </legend>
              <RadioGroup
                value={choice}
                onValueChange={(next) => setChoice(String(next))}
              >
                {matches.map((match) => (
                  <label
                    key={match.id}
                    className="flex items-center gap-3 text-sm leading-5"
                  >
                    <RadioGroupItem value={match.id} />
                    <span dir="auto">{displayName(match)}</span>
                    {match.birthYear ? (
                      <span className="text-muted-foreground">
                        {match.birthYear}
                      </span>
                    ) : null}
                  </label>
                ))}
                <label className="flex items-center gap-3 text-sm leading-5">
                  <RadioGroupItem value="new" />
                  {m.guardianSomeoneElse()}
                </label>
              </RadioGroup>
            </fieldset>
          ) : (
            <p className="text-sm leading-5">{m.guardianNoMatch()}</p>
          )}
          {choice === "new" ? (
            <NameFields
              idPrefix="guardian"
              value={names}
              onChange={setNames}
              error={errors.names}
            />
          ) : null}
          <RelationshipFields
            idPrefix="new-guardian"
            value={flags}
            onChange={(next) => {
              setErrors((current) => ({ ...current, portal: undefined }));
              setFlags(next);
            }}
            relations={options.relations}
            portalError={errors.portal}
          />
        </>
      )}
      {matches === null ? null : (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() => setMatches(null)}
        >
          {m.guardianSearchAgain()}
        </Button>
      )}
    </SheetForm>
  );
}

interface GuardianItemProps {
  guardian: Guardian;
  actions?: ReactNode;
}

function GuardianItem({ guardian, actions }: GuardianItemProps) {
  const relations = useSuspenseQuery(relationsQuery).data;
  const relation = labelOf(
    relations.find((row) => row.id === guardian.relationId) ?? null,
  );
  const phone = guardian.contacts.find((contact) => contact.kind === "phone");
  const email = guardian.contacts.find((contact) => contact.kind === "email");
  const address = guardian.contacts.find(
    (contact) => contact.kind === "postal",
  );
  const flags: string[] = [];
  if (guardian.residence === "primary")
    flags.push(m.guardianResidencePrimary());
  if (guardian.residence === "secondary")
    flags.push(m.guardianResidenceSecondary());
  if (guardian.primaryContact) flags.push(m.recordPrimaryContact());
  if (guardian.legalGuardian) flags.push(m.guardianLegal());
  if (guardian.portalAccess) flags.push(m.guardianPortalAccess());
  if (guardian.pickup === "not_allowed")
    flags.push(m.guardianPickupNotAllowed());
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
      >
        {initialsOf(displayName(guardian))}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Link
          to="/people/$userId"
          params={{ userId: guardian.userId }}
          dir="auto"
          className={cn(
            "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
            phoneLink,
          )}
        >
          {displayName(guardian)}
        </Link>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {[relation, ...flags].join(" · ")}
        </p>
        <p className="flex flex-wrap items-center gap-x-4 text-[13px] leading-[18px]">
          <span>
            <span className="sr-only">{m.familyMobile()}: </span>
            <Phone value={phone?.normalized ?? phone?.value} />
          </span>
          {email ? <Email value={email.value} /> : null}
        </p>
        {address ? (
          <p className="text-[13px] leading-[18px]">
            <span className="sr-only">{m.addressTitle()}: </span>
            <bdi>{address.value}</bdi>
          </p>
        ) : null}
      </div>
      {actions}
    </li>
  );
}

interface GuardiansSectionProps {
  studentId: string;
  onAdd?: () => void;
  itemActions?: (guardian: Guardian) => ReactNode;
}

function GuardiansSection({
  studentId,
  onAdd,
  itemActions,
}: GuardiansSectionProps) {
  const { guardians } = useSuspenseQuery(guardiansQuery(studentId)).data;
  return (
    <RecordSection
      title={m.studentGuardians()}
      action={
        onAdd ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={onAdd}
          >
            <Plus aria-hidden />
            {m.guardianAdd()}
          </Button>
        ) : undefined
      }
    >
      {guardians.length === 0 ? (
        <RecordEmpty>{m.studentNoGuardians()}</RecordEmpty>
      ) : (
        <RecordList>
          {guardians.map((guardian) => (
            <GuardianItem
              key={guardian.relationshipId}
              guardian={guardian}
              actions={itemActions?.(guardian)}
            />
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

interface SiblingsSectionProps {
  studentId: string;
}

/** Students who share a parent or guardian with this one. */
function SiblingsSection({ studentId }: SiblingsSectionProps) {
  const siblings = useSuspenseQuery(siblingsQuery(studentId)).data;
  return (
    <RecordSection title={m.siblingsTitle()} description={m.siblingsHint()}>
      {siblings.length === 0 ? (
        <RecordEmpty>{m.siblingsNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {siblings.map((sibling) => (
            <li key={sibling.userId} className="flex items-center gap-3 py-3">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              >
                {initialsOf(displayName(sibling))}
              </span>
              <Link
                to="/students/$studentId"
                params={{ studentId: sibling.userId }}
                search={{}}
                dir="auto"
                className={cn(
                  "text-sm leading-5 font-medium hover:text-primary hover:underline",
                  phoneLink,
                )}
              >
                {displayName(sibling)}
              </Link>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

export interface GuardianNoticesProps {
  studentId: string;
}

/**
 * What the school last told the student's guardians, and which of them has
 * read each notice, so the office knows what a family already knows before
 * it rings them.
 */
export function GuardianNotices({ studentId }: GuardianNoticesProps) {
  const notices = useSuspenseQuery(guardianNoticesQuery(studentId)).data;
  return (
    <RecordSection
      title={m.studentNoticesTitle()}
      description={m.studentNoticesHint()}
    >
      {notices.length === 0 ? (
        <RecordEmpty>{m.studentNoticesNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {notices.map((notice) => {
            const Icon = KIND_ICON[notice.kind];
            const text = noticeText({
              id: `${notice.kind}:${notice.subjectId}`,
              kind: notice.kind,
              subjectId: notice.subjectId,
              params: notice.params,
              actorNameEn: null,
              actorNameAr: null,
            });
            const named = (read: boolean) =>
              notice.recipients
                .filter((recipient) => recipient.read === read)
                .map((recipient) =>
                  inLocale(recipient.nameEn, recipient.nameAr),
                );
            const read = named(true);
            const unread = named(false);
            return (
              <li
                key={`${notice.kind}:${notice.subjectId}`}
                className="flex items-start gap-3 py-3"
              >
                <Icon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    {text.title}
                  </span>
                  {text.body ? (
                    <span
                      dir="auto"
                      className="truncate text-sm leading-5 text-muted-foreground"
                    >
                      {text.body}
                    </span>
                  ) : null}
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {[
                      formatInstant(notice.createdAt, "medium"),
                      read.length > 0
                        ? m.studentNoticeReadBy({ names: formatList(read) })
                        : null,
                      unread.length > 0
                        ? m.studentNoticeUnreadBy({
                            names: formatList(unread),
                          })
                        : null,
                    ]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </span>
                </span>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

interface GuardianMenuProps {
  guardian: Guardian;
  onEdit: () => void;
  onContacts: () => void;
  onEnd: () => Promise<void>;
}

function GuardianMenu({
  guardian,
  onEdit,
  onContacts,
  onEnd,
}: GuardianMenuProps) {
  const name = displayName(guardian);
  return (
    <ActionMenu
      label={m.guardianActions({ name })}
      actions={[
        { label: m.guardianEditLink(), icon: Pencil, onSelect: onEdit },
        { label: m.contactsEdit(), icon: Contact, onSelect: onContacts },
        {
          label: m.guardianEndLink(),
          destructive: true,
          confirm: {
            title: m.guardianEndLinkTitle({ name }),
            body: m.guardianEndLinkBody({ name }),
            label: m.guardianEndLink(),
          },
          onSelect: onEnd,
        },
      ]}
    />
  );
}

export interface StudentFamilyProps {
  studentId: string;
  name: string;
}

/**
 * A student's family on their record: their guardians, which the office
 * links, edits and ends, the custody records staff who keep them read, and
 * the brothers and sisters at the school.
 */
export function StudentFamily({ studentId, name }: StudentFamilyProps) {
  const { access } = useSuspenseQuery(guardiansQuery(studentId)).data;
  const endLink = useEndLink(studentId);
  const [sheet, setSheet] = useState<{
    guardian: Guardian | null;
    open: boolean;
    key: number;
  }>({ guardian: null, open: false, key: 0 });
  const [contacts, setContacts] = useState<{
    guardian: Guardian | null;
    open: boolean;
    key: number;
  }>({ guardian: null, open: false, key: 0 });
  const guardianActions = access.manage
    ? (guardian: Guardian) => (
        <GuardianMenu
          guardian={guardian}
          onEdit={() =>
            setSheet((current) => ({
              guardian,
              open: true,
              key: current.key + 1,
            }))
          }
          onContacts={() =>
            setContacts((current) => ({
              guardian,
              open: true,
              key: current.key + 1,
            }))
          }
          onEnd={() => endLink(guardian, name)}
        />
      )
    : undefined;
  const student = { id: studentId };
  return (
    <RecordColumns
      main={
        <>
          <GuardiansSection
            studentId={studentId}
            onAdd={
              access.manage
                ? () =>
                    setSheet((current) => ({
                      guardian: null,
                      open: true,
                      key: current.key + 1,
                    }))
                : undefined
            }
            itemActions={guardianActions}
          />
          {access.custody ? (
            <Deferred>
              <CustodySection studentId={studentId} />
            </Deferred>
          ) : null}
          <Deferred>
            <SiblingsSection studentId={studentId} />
          </Deferred>
          {access.manage ? (
            sheet.guardian ? (
              <GuardianSheet
                key={sheet.key}
                student={student}
                guardian={sheet.guardian}
                open={sheet.open}
                onClose={() =>
                  setSheet((current) => ({ ...current, open: false }))
                }
              />
            ) : (
              <AddGuardianSheet
                key={sheet.key}
                student={student}
                open={sheet.open}
                onClose={() =>
                  setSheet((current) => ({ ...current, open: false }))
                }
              />
            )
          ) : null}
          {access.manage && contacts.guardian ? (
            <ContactsSheet
              key={contacts.key}
              userId={contacts.guardian.userId}
              name={displayName(contacts.guardian)}
              contacts={contacts.guardian.contacts}
              open={contacts.open}
              onClose={() =>
                setContacts((current) => ({ ...current, open: false }))
              }
            />
          ) : null}
        </>
      }
    />
  );
}

export interface StudentFamilyOverviewProps {
  studentId: string;
  manage: boolean;
}

/** A student's guardians on their record's overview, and what the school last told them. */
export function StudentFamilyOverview({
  studentId,
  manage,
}: StudentFamilyOverviewProps) {
  return (
    <>
      <GuardiansSection studentId={studentId} />
      {manage ? (
        <Deferred>
          <GuardianNotices studentId={studentId} />
        </Deferred>
      ) : null}
    </>
  );
}
