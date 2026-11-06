import type { ReactNode } from "react";

import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { picturedQuery } from "~/queries/files";
import { studentsQuery } from "~/queries/students";
import { tagPictured } from "~/server/files";
import { getMessageFromError } from "~/utils/error";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof picturedQuery>["queryFn"]>>
>;
type Person = Data["files"][number]["people"][number];

/** Where the pictures are going: the public website, or news inside the school. */
export type PictureChannel = "website" | "news";

function Answer({
  person,
  channel,
}: {
  person: Person;
  channel: PictureChannel;
}) {
  const answer = person[channel];
  return (
    <StatusText tone={answer === "granted" ? "success" : "warning"}>
      {(answer === "granted"
        ? m.picturedMayAppear
        : answer === "refused"
          ? m.picturedRefused
          : m.picturedUnanswered)({ name: displayName(person) })}
    </StatusText>
  );
}

function PeopleSheet({
  fileId,
  channel,
  open,
  onClose,
}: {
  fileId: string;
  channel: PictureChannel;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const picture = useQuery(picturedQuery([fileId])).data?.files[0] ?? null;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const needle = search.trim();
  const hits =
    useQuery({
      ...studentsQuery({
        year: "",
        q: needle,
        grade: [],
        status: [],
        missing: [],
        sort: "name",
        dir: "asc",
        page: 1,
        pageSize: 25,
      }),
      enabled: needle.length >= 2,
    }).data?.rows ?? [];
  const tagged = picture?.people ?? [];
  const chosen = picked ?? tagged.map((row) => row.id);
  const known = new Map<string, string>([
    ...tagged.map((row): [string, string] => [row.id, displayName(row)]),
    ...hits.map((row): [string, string] => [row.id, displayName(row)]),
  ]);
  const mutation = useMutation({
    mutationFn: () => tagPictured({ data: { id: fileId, studentIds: chosen } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.picturedTagTitle()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({
              queryKey: ["files", "pictured"],
            });
            toast.success(m.picturedSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <img
        src={`/files/${fileId}`}
        alt={picture?.name ?? ""}
        className="max-h-64 w-full rounded-md border object-contain"
      />
      <p className="text-sm leading-5 text-muted-foreground">
        {m.picturedHint()}
      </p>
      <ComboboxField
        label={m.picturedStudents()}
        hint={m.picturedStudentsHint()}
        multiple
        clearable
        options={[...known].map(([value, label]) => ({ value, label }))}
        value={chosen}
        onChange={setPicked}
        search={search}
        onSearchChange={setSearch}
      />
      {tagged.length > 0 ? (
        <ul className="grid gap-1 text-[13px] leading-[18px]">
          {tagged.map((person) => (
            <li key={person.id}>
              <Answer person={person} channel={channel} />
            </li>
          ))}
        </ul>
      ) : null}
    </SheetForm>
  );
}

/**
 * Naming who a picture shows, offered on the picture itself: a document's
 * editor passes `open` as its media's `people`, and the sheet shows each
 * named student's family answer for where the document is going.
 */
export function usePicturePeople(channel: PictureChannel): {
  open: (fileId: string) => void;
  sheet: ReactNode;
} {
  const [state, setState] = useState<{
    fileId: string | null;
    open: boolean;
    key: number;
  }>({ fileId: null, open: false, key: 0 });
  const open = useCallback(
    (fileId: string) =>
      setState((current) => ({ fileId, open: true, key: current.key + 1 })),
    [],
  );
  return {
    open,
    sheet: state.fileId ? (
      <PeopleSheet
        key={state.key}
        fileId={state.fileId}
        channel={channel}
        open={state.open}
        onClose={() => setState((current) => ({ ...current, open: false }))}
      />
    ) : null,
  };
}
