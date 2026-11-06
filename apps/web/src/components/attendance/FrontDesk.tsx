import type { Column } from "@faridalms/ui/system/data-table";

import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DoorOpen, LogIn, LogOut, ShieldX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { classTitle } from "~/components/classes/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { frontDeskQuery } from "~/queries/attendance";
import {
  findDeskStudents,
  getPickupContacts,
  signStudentIn,
  signStudentOut,
} from "~/server/attendance";
import { schoolClockAt } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { DayNav } from "./DayNav";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof frontDeskQuery>["queryFn"]>>
>;
type Movement = Data["movements"][number];
type Direction = "in" | "out";

const OTHER = "other";

const nameOf = (row: {
  fullNameEn: string | null;
  fullNameAr: string | null;
}) => inLocale(row.fullNameEn, row.fullNameAr);

const direction = (row: Movement) =>
  row.direction === "in" ? (
    <StatusText tone="info">{m.deskIn()}</StatusText>
  ) : (
    <StatusText tone="warning">{m.deskOut()}</StatusText>
  );

function detailOf(row: Movement) {
  return [
    inLocale(row.reasonEn, row.reasonAr),
    row.direction === "out" && (row.collectedByNameEn || row.collectedByNameAr)
      ? m.deskCollectedBy({
          name: inLocale(row.collectedByNameEn, row.collectedByNameAr),
        })
      : null,
    row.note,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Movement>[] {
  return [
    {
      id: "at",
      header: m.deskTime(),
      cell: (row) => <bdi className="tabular-nums">{row.at}</bdi>,
    },
    { id: "student", header: m.attStudent(), primary: true, cell: nameOf },
    { id: "direction", header: m.deskWhat(), cell: direction },
    {
      id: "detail",
      header: m.deskDetail(),
      cell: (row) => detailOf(row) || "–",
    },
    {
      id: "by",
      header: m.deskRecordedBy(),
      cell: (row) => inLocale(row.byNameEn, row.byNameAr),
    },
  ];
}

const card = {
  title: nameOf,
  status: direction,
  fact: (row: Movement) => [row.at, detailOf(row)].filter(Boolean).join(" · "),
};

export interface FrontDeskProps {
  date: string;
  onDate: (date: string) => void;
}

/**
 * Reception's book of late arrivals and early departures. Signing a child
 * in or out writes the mark to the day's registers; a departure records who
 * collected the child, from those the school holds as allowed.
 */
export function FrontDesk({ date, onDate }: FrontDeskProps) {
  const data = useSuspenseQuery(frontDeskQuery(date)).data;
  const [signing, setSigning] = useState<Direction | null>(null);
  const today = data.date === data.today;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DayNav
          id="front-desk-date"
          date={data.date}
          min={data.year?.startsOn ?? data.today}
          max={data.today}
          today={data.today}
          onChange={onDate}
        />
        {today ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="max-md:h-10"
              onClick={() => setSigning("in")}
            >
              <LogIn aria-hidden />
              {m.deskSignIn()}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => setSigning("out")}
            >
              <LogOut aria-hidden />
              {m.deskSignOut()}
            </Button>
          </div>
        ) : null}
      </div>
      <DataTable
        caption={m.deskTab()}
        rows={data.movements}
        columns={columns()}
        rowLabel={nameOf}
        card={card}
        empty={{
          icon: DoorOpen,
          title: m.deskNone(),
          description: m.deskNoneBody(),
        }}
      />
      {signing ? (
        <SignSheet
          direction={signing}
          reasons={data.reasons}
          onClose={() => setSigning(null)}
        />
      ) : null}
    </div>
  );
}

interface SignSheetProps {
  direction: Direction;
  reasons: Data["reasons"];
  onClose: () => void;
}

function SignSheet({ direction: way, reasons, onClose }: SignSheetProps) {
  const queryClient = useQueryClient();
  const signIn = useServerFn(signStudentIn);
  const signOut = useServerFn(signStudentOut);
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [at, setAt] = useState(() => schoolClockAt());
  const [reasonId, setReasonId] = useState("");
  const [collector, setCollector] = useState("");
  const [otherName, setOtherName] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const needle = search.trim();
  const hits =
    useQuery({
      queryKey: ["attendance", "desk-find", needle],
      queryFn: () => findDeskStudents({ data: { q: needle } }),
      enabled: needle.length >= 2,
      placeholderData: (previous) => previous,
    }).data ?? [];
  const [picked, setPicked] = useState<(typeof hits)[number] | null>(null);
  const contacts =
    useQuery({
      queryKey: ["attendance", "pickup", studentId],
      queryFn: () => getPickupContacts({ data: { studentId } }),
      enabled: way === "out" && studentId !== "",
    }).data ?? [];
  const options = [
    ...(picked && !hits.some((hit) => hit.id === picked.id) ? [picked] : []),
    ...hits,
  ].map((hit) => ({
    value: hit.id,
    label: hit.homeroomCode
      ? `${nameOf(hit)} · ${classTitle({
          code: hit.homeroomCode,
          titleEn: hit.homeroomTitleEn,
          titleAr: hit.homeroomTitleAr,
        })}`
      : nameOf(hit),
  }));
  const someoneElse = collector === OTHER;
  const save = useMutation({
    mutationFn: () =>
      way === "in"
        ? signIn({ data: { studentId, at, reasonId, note } })
        : signOut({
            data: {
              studentId,
              at,
              reasonId,
              collectedById: someoneElse ? "" : collector,
              collectedByName: someoneElse ? otherName : "",
              note,
            },
          }),
    onSuccess: async () => {
      toast.success(
        way === "in"
          ? m.deskSignedIn({ name: picked ? nameOf(picked) : "" })
          : m.deskSignedOut({ name: picked ? nameOf(picked) : "" }),
      );
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      onClose();
    },
  });
  const whoMissing =
    way === "out" && (!collector || (someoneElse && !otherName.trim()));
  return (
    <SheetForm
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={way === "in" ? m.deskSignIn() : m.deskSignOut()}
      submitLabel={way === "in" ? m.deskSignIn() : m.deskSignOut()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        setChecked(true);
        if (!studentId || !at || whoMissing) return;
        save.mutate();
      }}
    >
      <ComboboxField
        label={m.attStudent()}
        options={options}
        value={studentId ? [studentId] : []}
        onChange={(next) => {
          const id = next[0] ?? "";
          setStudentId(id);
          setCollector("");
          setPicked(hits.find((hit) => hit.id === id) ?? null);
        }}
        search={search}
        onSearchChange={setSearch}
        searchLabel={m.deskTypeName()}
        errors={checked && !studentId ? [m.deskChooseStudent()] : undefined}
      />
      <TextField
        id="desk-at"
        type="time"
        label={way === "in" ? m.deskArrived() : m.deskLeaving()}
        width="code"
        value={at}
        onChange={(event) => setAt(event.target.value)}
      />
      <SelectField
        id="desk-reason"
        label={m.repReason()}
        optional
        value={reasonId}
        options={[
          { value: "", label: m.attNoReason() },
          ...reasons.map((row) => ({
            value: row.id,
            label: inLocale(row.labelEn, row.labelAr) || row.code,
          })),
        ]}
        onChange={setReasonId}
      />
      {way === "out" && studentId ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm leading-5 font-medium">
            {m.deskWhoCollects()}
          </legend>
          <RadioGroup
            value={collector}
            onValueChange={(value: string) => setCollector(value)}
            className="gap-1"
          >
            {contacts.map((contact) => {
              const barred = contact.pickup === "not_allowed";
              return (
                <label
                  key={contact.userId}
                  htmlFor={`collect-${contact.userId}`}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60 has-disabled:opacity-70"
                >
                  <RadioGroupItem
                    id={`collect-${contact.userId}`}
                    value={contact.userId}
                    disabled={barred}
                    className="mt-0.5"
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm leading-5 font-medium">
                      <bdi>{nameOf(contact)}</bdi>
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {inLocale(contact.relationEn, contact.relationAr)}
                      </span>
                    </span>
                    {barred ? (
                      <span className="flex items-center gap-1 text-[13px] leading-[18px] text-destructive">
                        <ShieldX className="size-3.5" aria-hidden />
                        {m.deskMustNotCollect()}
                      </span>
                    ) : contact.pickup === "ask_office" ? (
                      <span className="text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
                        {m.deskAskFirst()}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
            <label
              htmlFor="collect-other"
              className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
            >
              <RadioGroupItem
                id="collect-other"
                value={OTHER}
                className="mt-0.5"
              />
              <span className="text-sm leading-5">{m.deskSomeoneElse()}</span>
            </label>
          </RadioGroup>
          {someoneElse ? (
            <TextField
              id="desk-other"
              label={m.deskTheirName()}
              hint={m.deskTheirNameHint()}
              width="name"
              value={otherName}
              onChange={(event) => setOtherName(event.target.value)}
            />
          ) : null}
          {checked && whoMissing ? (
            <p className="text-[13px] leading-[18px] text-destructive">
              {m.deskChooseCollector()}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <FormField id="desk-note" label={m.fupNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
