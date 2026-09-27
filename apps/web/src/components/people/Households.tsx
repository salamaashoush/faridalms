import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { initialsOf } from "~/components/app/UserMenu";
import { formatDate } from "~/components/family/format";
import { ActionMenu } from "~/components/system/ActionMenu";
import { ComboboxField } from "~/components/system/ComboboxField";
import { SelectField, TextField } from "~/components/system/field";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { householdQuery, householdsOfQuery } from "~/queries/households";
import {
  addToHousehold,
  endHouseholdMembership,
  saveHousehold,
  searchPeople,
} from "~/server/households";
import { cn } from "~/utils/cn";
import { formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName, roleLabel } from "./format";
import { LANGUAGE_CODES, languageName } from "./regions";

type Household = Awaited<
  ReturnType<NonNullable<ReturnType<typeof householdQuery>["queryFn"]>>
>;
type Member = Household["members"][number];

export function householdName(household: {
  nameEn: string | null;
  nameAr: string | null;
}) {
  return inLocale(household.nameEn, household.nameAr);
}

function otherHouseholdName(household: {
  nameEn: string | null;
  nameAr: string | null;
}) {
  const shown = householdName(household);
  const other =
    household.nameEn === shown ? household.nameAr : household.nameEn;
  return other && other !== shown ? other : null;
}

export function HouseholdSheet({
  household,
  open,
  onClose,
}: {
  household: Household | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [nameEn, setNameEn] = useState(household?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(household?.nameAr ?? "");
  const [language, setLanguage] = useState(household?.primaryLanguage ?? "ar");
  const [nameError, setNameError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveHousehold({
        data: {
          ...(household
            ? { id: household.id, expectedVersion: household.version }
            : {}),
          nameEn,
          nameAr,
          primaryLanguage: language,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={household ? m.householdEdit() : m.householdAdd()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!nameEn.trim() && !nameAr.trim()) {
          setNameError(m.validationNameRequired());
          return;
        }
        await mutation.mutateAsync().then(
          async (saved) => {
            await queryClient.invalidateQueries({ queryKey: ["people"] });
            toast.success(m.managementSaved());
            onClose();
            if (!household)
              void navigate({
                to: "/families/$householdId",
                params: { householdId: saved.id },
              });
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="household-name-ar"
        label={m.householdNameArabic()}
        dir="rtl"
        width="name"
        maxLength={120}
        autoComplete="off"
        value={nameAr}
        onChange={(event) => {
          setNameError(null);
          setNameAr(event.target.value);
        }}
        errors={nameError ? [nameError] : undefined}
      />
      <TextField
        id="household-name-en"
        label={m.householdNameEnglish()}
        dir="ltr"
        width="name"
        maxLength={120}
        autoComplete="off"
        value={nameEn}
        onChange={(event) => {
          setNameError(null);
          setNameEn(event.target.value);
        }}
      />
      <SelectField
        id="household-language"
        label={m.householdLanguage()}
        hint={m.householdLanguageHint()}
        value={language}
        options={LANGUAGE_CODES.map((code) => ({
          value: code,
          label: languageName(code),
        }))}
        onChange={setLanguage}
        width="name"
      />
    </SheetForm>
  );
}

function AddMemberSheet({
  household,
  open,
  onClose,
}: {
  household: Household;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState("");
  const [residence, setResidence] = useState<"primary" | "secondary">(
    "primary",
  );
  const [error, setError] = useState<string | null>(null);
  const needle = search.trim();
  const hits =
    useQuery({
      queryKey: ["people", "search", needle],
      queryFn: () => searchPeople({ data: { q: needle } }),
      enabled: needle.length >= 2,
      placeholderData: (previous) => previous,
    }).data ?? [];
  const [picked, setPicked] = useState<{
    id: string;
    isStudent: boolean;
    name: string;
  } | null>(null);
  const already = new Set(household.members.map((member) => member.userId));
  const options = hits
    .filter((hit) => !already.has(hit.id))
    .map((hit) => ({
      value: hit.id,
      label: `${displayName(hit)} · ${
        hit.roles.length
          ? formatList(hit.roles.map(roleLabel))
          : m.householdAdult()
      }`,
    }));
  const mutation = useMutation({
    mutationFn: () =>
      addToHousehold({
        data: {
          householdId: household.id,
          userId: chosen,
          kind: picked?.isStudent ? "child" : "adult",
          residence,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.householdAddMember()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!chosen) {
          setError(m.validationSelection());
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["people"] });
            toast.success(m.householdMemberAdded({ name: picked?.name ?? "" }));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <ComboboxField
        label={m.householdPerson()}
        hint={m.householdPersonHint()}
        options={options}
        value={chosen ? [chosen] : []}
        onChange={(next) => {
          setError(null);
          const id = next[0] ?? "";
          setChosen(id);
          const hit = hits.find((entry) => entry.id === id);
          setPicked(
            hit
              ? { id, isStudent: hit.isStudent, name: displayName(hit) }
              : null,
          );
        }}
        search={search}
        onSearchChange={setSearch}
        errors={error ? [error] : undefined}
      />
      {picked?.isStudent ? (
        <SelectField
          id="member-residence"
          label={m.householdResidence()}
          hint={m.householdResidenceHint()}
          value={residence}
          options={[
            { value: "primary", label: m.householdResidencePrimary() },
            { value: "secondary", label: m.householdResidenceSecondary() },
          ]}
          onChange={(value) =>
            setResidence(value === "secondary" ? "secondary" : "primary")
          }
          width="name"
        />
      ) : null}
    </SheetForm>
  );
}

function MemberItem({
  member,
  household,
  manage,
}: {
  member: Member;
  household: Household;
  manage: boolean;
}) {
  const queryClient = useQueryClient();
  const name = displayName(member);
  const end = async () => {
    try {
      await endHouseholdMembership({
        data: {
          householdId: household.id,
          memberId: member.id,
          expectedVersion: member.version,
        },
      });
    } catch (error) {
      throw new Error(getMessageFromError(error), { cause: error });
    }
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    toast.success(m.householdMemberEnded({ name }));
  };
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
      >
        {initialsOf(name)}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {member.kind === "child" ? (
          <Link
            to="/students/$studentId"
            params={{ studentId: member.userId }}
            search={{}}
            className={cn(
              "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
              phoneLink,
            )}
          >
            <bdi>{name}</bdi>
          </Link>
        ) : (
          <Link
            to="/people/$userId"
            params={{ userId: member.userId }}
            search={{}}
            className={cn(
              "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
              phoneLink,
            )}
          >
            <bdi>{name}</bdi>
          </Link>
        )}
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            member.kind === "child"
              ? member.residence === "primary"
                ? m.householdResidencePrimary()
                : m.householdResidenceSecondary()
              : null,
            m.personSince({ date: formatDate(member.from) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {manage ? (
        <ActionMenu
          label={m.householdMemberActions({ name })}
          actions={[
            {
              label: m.householdEndMember(),
              icon: UserMinus,
              destructive: true,
              confirm: {
                title: m.householdEndMemberTitle({
                  name,
                  household: householdName(household),
                }),
                body: m.householdEndMemberBody({ name }),
                label: m.householdEndMember(),
              },
              onSelect: end,
            },
          ]}
        />
      ) : null}
    </li>
  );
}

export function HouseholdRecord({ householdId }: { householdId: string }) {
  const household = useSuspenseQuery(householdQuery(householdId)).data;
  const [editing, setEditing] = useState({ open: false, key: 0 });
  const [adding, setAdding] = useState({ open: false, key: 0 });
  const name = householdName(household);
  const adults = household.members.filter((member) => member.kind === "adult");
  const children = household.members.filter(
    (member) => member.kind === "child",
  );
  const other = otherHouseholdName(household);
  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={name}
        initials={initialsOf(name)}
        facts={[
          ...(other
            ? [{ label: m.peopleOtherName(), value: <bdi>{other}</bdi> }]
            : []),
          ...(household.primaryLanguage
            ? [
                {
                  label: m.householdLanguage(),
                  value: languageName(household.primaryLanguage),
                },
              ]
            : []),
        ]}
        action={
          household.manage
            ? {
                label: m.householdAddMember(),
                icon: Plus,
                onClick: () =>
                  setAdding((current) => ({
                    open: true,
                    key: current.key + 1,
                  })),
              }
            : undefined
        }
        menu={
          household.manage
            ? [
                {
                  label: m.householdEdit(),
                  icon: Pencil,
                  onSelect: () =>
                    setEditing((current) => ({
                      open: true,
                      key: current.key + 1,
                    })),
                },
              ]
            : []
        }
      />
      <RecordColumns
        main={
          <>
            <RecordSection title={m.householdChildren()}>
              {children.length === 0 ? (
                <RecordEmpty>{m.householdNoChildren()}</RecordEmpty>
              ) : (
                <RecordList>
                  {children.map((member) => (
                    <MemberItem
                      key={member.id}
                      member={member}
                      household={household}
                      manage={household.manage}
                    />
                  ))}
                </RecordList>
              )}
            </RecordSection>
            <RecordSection title={m.householdAdults()}>
              {adults.length === 0 ? (
                <RecordEmpty>{m.householdNoAdults()}</RecordEmpty>
              ) : (
                <RecordList>
                  {adults.map((member) => (
                    <MemberItem
                      key={member.id}
                      member={member}
                      household={household}
                      manage={household.manage}
                    />
                  ))}
                </RecordList>
              )}
            </RecordSection>
          </>
        }
      />
      {household.manage ? (
        <>
          <HouseholdSheet
            key={`edit-${editing.key}`}
            household={household}
            open={editing.open}
            onClose={() =>
              setEditing((current) => ({ ...current, open: false }))
            }
          />
          <AddMemberSheet
            key={`add-${adding.key}`}
            household={household}
            open={adding.open}
            onClose={() =>
              setAdding((current) => ({ ...current, open: false }))
            }
          />
        </>
      ) : null}
    </div>
  );
}

/** The student's homes, on the Family tab. */
export function HomesSection({ userId }: { userId: string }) {
  const homes = useSuspenseQuery(householdsOfQuery(userId)).data;
  return (
    <RecordSection
      title={m.householdHomes()}
      description={m.householdHomesHint()}
    >
      {homes.length === 0 ? (
        <RecordEmpty>{m.householdNoHomes()}</RecordEmpty>
      ) : (
        <RecordList>
          {homes.map((home) => (
            <li key={home.id} className="grid gap-0.5 py-3">
              <Link
                to="/families/$householdId"
                params={{ householdId: home.id }}
                className={cn(
                  "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
                  phoneLink,
                )}
              >
                <bdi>{householdName(home)}</bdi>
              </Link>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {home.residence === "primary"
                  ? m.householdResidencePrimary()
                  : m.householdResidenceSecondary()}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}
