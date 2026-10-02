import { Button } from "@faridalms/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import { ComboboxField } from "~/components/system/ComboboxField";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { picturedQuery } from "~/queries/files";
import { studentsQuery } from "~/queries/students";
import { tagPictured } from "~/server/files";
import { getMessageFromError } from "~/utils/error";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof picturedQuery>["queryFn"]>>
>;
type Picture = Data["files"][number];
type Person = Picture["people"][number];

/** Where the pictures are going: the public website, or news inside the school. */
export type PictureChannel = "website" | "news";

const allowed = (person: Person, channel: PictureChannel) =>
  person[channel] === "granted";

function TagSheet({
  picture,
  open,
  onClose,
}: {
  picture: Picture;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState(picture.people.map((row) => row.id));
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
  const known = new Map<string, string>([
    ...picture.people.map((row): [string, string] => [
      row.id,
      displayName(row),
    ]),
    ...hits.map((row): [string, string] => [row.id, displayName(row)]),
  ]);
  const mutation = useMutation({
    mutationFn: () =>
      tagPictured({ data: { id: picture.id, studentIds: picked } }),
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
        src={`/files/${picture.id}`}
        alt={picture.name}
        className="max-h-64 w-full rounded-md border object-contain"
      />
      <ComboboxField
        label={m.picturedStudents()}
        hint={m.picturedStudentsHint()}
        multiple
        clearable
        options={[...known].map(([value, label]) => ({ value, label }))}
        value={picked}
        onChange={setPicked}
        search={search}
        onSearchChange={setSearch}
      />
    </SheetForm>
  );
}

/**
 * The students each picture in a document shows, and whether each may be
 * shown where it is going. Publishing refuses a picture of a student whose
 * family has not agreed, so the person writing sees it here first.
 */
export function PicturedPeople({
  fileIds,
  channel,
}: {
  fileIds: readonly string[];
  channel: PictureChannel;
}) {
  const pictures = useQuery(picturedQuery(fileIds)).data?.files ?? [];
  const [sheet, setSheet] = useState<{
    picture: Picture | null;
    open: boolean;
    key: number;
  }>({ picture: null, open: false, key: 0 });
  if (pictures.length === 0)
    return (
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.picturedNone()}
      </p>
    );
  return (
    <>
      <ul className="grid gap-3">
        {pictures.map((picture) => (
          <li key={picture.id} className="flex items-start gap-3">
            <img
              src={`/files/${picture.id}`}
              alt={picture.name}
              className="h-12 w-16 shrink-0 rounded-md border object-cover"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              {picture.people.length === 0 ? (
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.picturedNobody()}
                </span>
              ) : (
                <ul className="grid gap-0.5 text-[13px] leading-[18px]">
                  {picture.people.map((person) => (
                    <li key={person.id}>
                      <StatusText
                        tone={allowed(person, channel) ? "success" : "warning"}
                      >
                        {(person[channel] === "granted"
                          ? m.picturedMayAppear
                          : person[channel] === "refused"
                            ? m.picturedRefused
                            : m.picturedUnanswered)({
                          name: displayName(person),
                        })}
                      </StatusText>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start max-md:h-10"
                aria-label={m.picturedTagFor({ name: picture.name })}
                onClick={() =>
                  setSheet((current) => ({
                    picture,
                    open: true,
                    key: current.key + 1,
                  }))
                }
              >
                <UserRoundPlus aria-hidden />
                {m.picturedTag()}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {sheet.picture ? (
        <TagSheet
          key={sheet.key}
          picture={sheet.picture}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
