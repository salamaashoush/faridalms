import type { ModuleId } from "@faridalms/domain/modules";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { BASIC_MODULES } from "@faridalms/domain/modules";
import {
  BASIC_ENTITLEMENTS,
  DEFAULT_LIMITS,
  settableOf,
} from "@faridalms/domain/plans";
import { Button } from "@faridalms/ui/button";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { FormSection } from "@faridalms/ui/system/record-form";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FilePen, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { CreateSchoolOutcome } from "../server/directory";

import { attempt, failure } from "../actions";
import { ModuleFields } from "../components/ModuleFields";
import {
  blankPerson,
  blankSchool,
  SchoolSpecForm,
} from "../components/SchoolSpecForm";
import { Sent } from "../components/Sent";
import { DRAFT_STEP_NAMES, formatWhen } from "../format";
import { createSchool } from "../server/directory";
import { getNewSchool, startNewDraft } from "../server/provisioning";

export const Route = createFileRoute("/schools/new")({
  staticData: { title: "New school" },
  loader: () => getNewSchool(),
  component: NewSchool,
});

const GIB = 1024 * 1024 * 1024;

function NewSchool() {
  const { cells, drafts } = Route.useLoaderData();
  return drafts ? <Drafts drafts={drafts} /> : <ByHand cells={cells} />;
}

type Data = Awaited<ReturnType<typeof getNewSchool>>;

type DraftRow = NonNullable<Data["drafts"]>[number];

const draftName = (draft: DraftRow) =>
  draft.schools.filter(Boolean).join(", ") || "Unnamed school";

const DRAFT_COLUMNS: Column<DraftRow>[] = [
  {
    id: "school",
    header: "School",
    primary: true,
    cell: (draft) => (
      <RowLink to="/provisioning/$draftId" params={{ draftId: draft.id }}>
        {draftName(draft)}
      </RowLink>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    cell: (draft) => draft.customerName ?? "No customer yet",
  },
  {
    id: "step",
    header: "Step",
    cell: (draft) =>
      draft.started ? (
        <StatusText tone="warning">Creating began</StatusText>
      ) : (
        <StatusText tone="info">{DRAFT_STEP_NAMES[draft.step]}</StatusText>
      ),
  },
  {
    id: "updated",
    header: "Last changed",
    cell: (draft) => (
      <span className="text-muted-foreground">
        {formatWhen(draft.updatedAt)}
      </span>
    ),
  },
];

const DRAFT_CARD: DataTableCard<DraftRow> = {
  title: (draft) => (
    <RowLink to="/provisioning/$draftId" params={{ draftId: draft.id }}>
      {draftName(draft)}
    </RowLink>
  ),
  fact: (draft) => DRAFT_STEP_NAMES[draft.step],
};

interface DraftsProps {
  drafts: DraftRow[];
}

/**
 * Where the console sells what it creates, a school is set up as a draft:
 * for a customer, with a plan, step by step, resumed where it was left.
 */
function Drafts({ drafts }: DraftsProps) {
  const navigate = useNavigate();
  const start = useServerFn(startNewDraft);
  const [starting, setStarting] = useState(false);
  return (
    <>
      <PageHeader
        title="New school"
        description="Six steps: the customer, its schools, what it buys, its addresses, the people who first run it, and a last look. Each step is kept, so a draft can be finished later or by someone else."
        action={{
          label: starting ? "Starting…" : "Start a new school",
          icon: Plus,
          onClick: () => {
            if (starting) return;
            setStarting(true);
            void attempt(async () => {
              const { id } = await start();
              await navigate({
                to: "/provisioning/$draftId",
                params: { draftId: id },
              });
            }, "A draft could not be started.").then((failed) => {
              setStarting(false);
              if (failed) toast.error(failed);
            });
          },
        }}
      />
      <DataTable
        caption="Drafts"
        rows={drafts}
        columns={DRAFT_COLUMNS}
        rowLabel={draftName}
        card={DRAFT_CARD}
        empty={{
          icon: FilePen,
          title: "No drafts",
          description:
            "Start a new school; it is kept as a draft until created.",
        }}
      />
    </>
  );
}

interface ByHandProps {
  cells: Data["cells"];
}

/**
 * Where the console runs without its business database, a school is
 * created in one form with what it is entitled to.
 */
function ByHand({ cells }: ByHandProps) {
  const create = useServerFn(createSchool);
  const [outcome, setOutcome] = useState<CreateSchoolOutcome | null>(null);
  const [modules, setModules] = useState<ModuleId[]>([...BASIC_MODULES]);
  const [poolGb, setPoolGb] = useState("");
  const [formKey, setFormKey] = useState(0);

  if (outcome?.ok)
    return (
      <div className="grid max-w-2xl" aria-live="polite">
        <PageHeader title="School created" />
        <RecordSection title="Links sent">
          <div className="grid gap-3">
            <Sent sent={outcome.sent} />
            {outcome.created ? null : (
              <p className="text-sm leading-5 text-muted-foreground">
                An earlier attempt had already created the school in its cell,
                so this sent its administrators new links.
              </p>
            )}
            {outcome.activated ? null : (
              <p role="alert" className="text-sm leading-5 text-destructive">
                The directory still shows the school as provisioning. Submit the
                same details again to finish.
              </p>
            )}
          </div>
        </RecordSection>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink
            to="/schools/$schoolId"
            params={{ schoolId: outcome.schoolId }}
          >
            Open the school
          </ButtonLink>
          <Button
            variant="outline"
            onClick={() => {
              setModules([...BASIC_MODULES]);
              setPoolGb("");
              setOutcome(null);
              setFormKey((key) => key + 1);
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    );

  return (
    <div className="grid">
      <PageHeader
        title="New school"
        description="Creates a school, or a group with its schools, in a cell, and emails each school's first administrator a link to choose a password."
      />
      <SchoolSpecForm
        key={formKey}
        label="New school"
        sections={{ tenant: true, people: true }}
        cells={cells}
        initial={{
          kind: "school",
          nameEn: "",
          nameAr: "",
          cellId: cells[0]?.id ?? "",
          defaultLocale: "en",
          jurisdictions: ["EG"],
          schools: [blankSchool()],
          administrators: [blankPerson()],
          groupAdministrator: null,
        }}
        takenSlugs={outcome?.ok === false ? outcome.takenSlugs : []}
        submitLabel="Create school"
        answer={outcome?.ok === false ? outcome.message : null}
        onSubmit={async (value) => {
          const pool = Number(poolGb);
          const poolBytes =
            poolGb.trim() !== "" && Number.isFinite(pool) && pool > 0
              ? Math.round(pool * GIB)
              : null;
          setOutcome(null);
          try {
            setOutcome(
              await create({
                data: {
                  ...value,
                  entitlements: {
                    ...settableOf(BASIC_ENTITLEMENTS),
                    poolBytes: poolBytes ?? DEFAULT_LIMITS.poolBytes,
                    modules,
                  },
                },
              }),
            );
          } catch (error) {
            const said = failure(
              error,
              "The console could not save the school. Try again.",
            );
            if (said) setOutcome({ ok: false, takenSlugs: [], message: said });
          }
        }}
      >
        <FormSection
          title="Entitlements"
          description="Basic and the default storage unless you choose more. Each school gets the same, which its page can change later."
        >
          <TextField
            label="School pool in GB"
            optional
            width="code"
            inputMode="decimal"
            value={poolGb}
            placeholder="Default"
            onChange={(event) => setPoolGb(event.target.value)}
          />
          <ModuleFields modules={modules} onChange={setModules} />
        </FormSection>
      </SchoolSpecForm>
    </div>
  );
}
