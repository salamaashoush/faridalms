import type { Cartridge } from "@faridalms/domain/cartridge-read";

import { readCartridge } from "@faridalms/domain/cartridge-read";
import { unpackZip } from "@faridalms/editor/packages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { classTitle } from "~/components/classes/format";
import { CheckboxRow } from "~/components/people/fields";
import { ComboboxField } from "~/components/system/ComboboxField";
import { FormField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { uploadDocumentFile } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { availableToolsQuery } from "~/queries/lti";
import { saveBankQuestion } from "~/server/bank";
import { saveAssignment } from "~/server/coursework";
import { initiateUpload } from "~/server/files";
import { saveLesson, saveModule } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { importBanks, importCartridge } from "./cartridgeImporter";

const CARTRIDGE = ".imscc,.zip,application/zip";

/**
 * Brings a course exported from Moodle, Canvas or another LMS in as
 * modules: the teacher picks the file, the modules to bring in and the
 * classes they are for, and each module arrives as a draft to look over.
 */
export function CartridgeImport({
  open,
  onClose,
  classes,
}: {
  open: boolean;
  onClose: () => void;
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  }[];
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initiate = useServerFn(initiateUpload);
  const save = useServerFn(saveModule);
  const saveOne = useServerFn(saveLesson);
  const assign = useServerFn(saveAssignment);
  const keepQuestion = useServerFn(saveBankQuestion);
  const tools = useQuery({ ...availableToolsQuery, enabled: open }).data;
  const [found, setFound] = useState<{
    files: Map<string, Uint8Array>;
    cartridge: Cartridge;
  } | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [keepBanks, setKeepBanks] = useState(true);
  const [classIds, setClassIds] = useState<string[]>(
    classes.length === 1 && classes[0] ? [classes[0].id] : [],
  );
  const [classSearch, setClassSearch] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      if (!found) throw new Error(m.lrnImportChoose());
      const banks = keepBanks && found.cartridge.banks.length > 0;
      if (chosen.length === 0 && !banks)
        throw new Error(m.lrnImportNoModules());
      if (chosen.length > 0 && classIds.length === 0)
        throw new Error(m.lrnClassesNeeded());
      const course = await importCartridge(found.cartridge, chosen, {
        files: found.files,
        classIds,
        toolIds: new Set((tools ?? []).map((tool) => tool.id)),
        uploadTo: (host) => (file) => uploadDocumentFile(initiate, file, host),
        saveModule: async (module) =>
          (
            await save({
              data: {
                id: "",
                expectedVersion: 0,
                title: module.title.slice(0, 200),
                summary: "",
                classIds,
                prerequisiteId: module.prerequisiteId,
                sequential: module.sequential,
              },
            })
          ).id,
        saveLesson: (lesson) =>
          saveOne({
            data: {
              id: "",
              moduleId: lesson.moduleId,
              expectedVersion: 0,
              title: lesson.title,
              completion: lesson.completion,
              passScore: lesson.passScore,
              content: lesson.content,
              language: lesson.language,
              publish: false,
            },
          }),
        saveAssignment: (assignment) =>
          assign({
            data: {
              classId: assignment.classId,
              title: assignment.title,
              brief: assignment.brief,
              audience: "class",
              availableFrom: "",
              dueAt: assignment.dueAt,
              closesAt: "",
              latePolicy: "accept",
              submissionFormat: assignment.submission,
              points: assignment.points,
              rubric: null,
            },
          }),
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const kept = banks
        ? await importBanks(found.cartridge, {
            files: found.files,
            upload: (file) => uploadDocumentFile(initiate, file, undefined),
            keep: (question) =>
              keepQuestion({
                data: {
                  id: "",
                  expectedVersion: 0,
                  scope: "mine",
                  tags: question.tags,
                  content: question.content,
                },
              }),
          })
        : { kept: 0, check: 0 };
      return {
        modules: course.modules,
        kept: kept.kept,
        counts: { ...course.counts, check: course.counts.check + kept.check },
      };
    },
    meta: { inlineError: true },
  });
  const read = (file: File) => {
    setFound(null);
    setProblem(null);
    void file
      .arrayBuffer()
      .then((buffer) => {
        const files = unpackZip(file.name, new Uint8Array(buffer));
        const cartridge = readCartridge(files);
        if (!cartridge || cartridge.modules.length === 0)
          throw new Error("not a cartridge");
        setFound({ files, cartridge });
        setChosen(cartridge.modules.map((_, index) => index));
      })
      .catch(() => setProblem(m.lrnImportUnreadable()));
  };
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.lrnImportTitle()}
      submitLabel={m.lrnImportSubmit()}
      pending={run.isPending}
      error={problem ?? (run.error ? getMessageFromError(run.error) : null)}
      onSubmit={async () => {
        await run.mutateAsync().then(
          async ({ modules, counts, kept }) => {
            toast.success(
              [
                counts.lessons > 0 || kept + counts.assignments === 0
                  ? m.lrnImported({ count: counts.lessons })
                  : null,
                kept > 0 ? m.lrnImportedBank({ count: kept }) : null,
                counts.assignments > 0
                  ? m.lrnImportedAssignments({ count: counts.assignments })
                  : null,
                counts.check + counts.failed > 0
                  ? m.lrnImportToCheck({ count: counts.check + counts.failed })
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
            );
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["learning"] }),
              queryClient.invalidateQueries({ queryKey: ["bank"] }),
            ]);
            onClose();
            const [first] = modules;
            if (modules.length === 1 && first)
              await navigate({
                to: "/modules/$moduleId",
                params: { moduleId: first.id },
                search: {},
              });
          },
          () => setProgress(null),
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.lrnImportHint()}
      </p>
      <FormField id="cartridge-file" label={m.lrnImportFile()}>
        {(control) => (
          <input
            {...control}
            type="file"
            accept={CARTRIDGE}
            disabled={run.isPending}
            className="text-sm file:me-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) read(file);
            }}
          />
        )}
      </FormField>
      {found ? (
        <fieldset className="grid min-w-0 gap-3">
          <legend className="mb-2 text-sm leading-5 font-medium">
            <bdi>{found.cartridge.title}</bdi>
          </legend>
          {found.cartridge.modules.map((module, index) => (
            <CheckboxRow
              key={`${index}-${module.title}`}
              label={module.title}
              hint={m.lrnImportItems({ count: module.items.length })}
              checked={chosen.includes(index)}
              disabled={run.isPending}
              onChange={(checked) =>
                setChosen((current) =>
                  checked
                    ? [...current, index].toSorted((a, b) => a - b)
                    : current.filter((each) => each !== index),
                )
              }
            />
          ))}
        </fieldset>
      ) : null}
      {found && found.cartridge.banks.length > 0 ? (
        <CheckboxRow
          label={m.lrnImportBanks({ count: found.cartridge.banks.length })}
          hint={m.lrnImportBanksHint()}
          checked={keepBanks}
          disabled={run.isPending}
          onChange={setKeepBanks}
        />
      ) : null}
      {found ? (
        <ComboboxField
          label={m.lrnClasses()}
          emptyLabel={m.lrnChooseClasses()}
          multiple
          options={classes
            .map((row) => ({ value: row.id, label: classTitle(row) }))
            .filter((row) =>
              row.label.toLowerCase().includes(classSearch.toLowerCase()),
            )}
          value={classIds}
          onChange={setClassIds}
          search={classSearch}
          onSearchChange={setClassSearch}
        />
      ) : null}
      {run.isPending && progress ? (
        <div className="grid gap-1.5">
          <output className="text-sm leading-5 text-muted-foreground">
            {m.lrnImportProgress({
              done: formatNumber(progress.done),
              total: formatNumber(progress.total),
            })}
          </output>
          <progress
            value={progress.done}
            max={progress.total}
            aria-label={m.lrnImportTitle()}
            className="block h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
          />
        </div>
      ) : null}
    </SheetForm>
  );
}
