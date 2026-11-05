import type { ModuleId } from "@faridalms/domain/modules";

import { BASIC_MODULES } from "@faridalms/domain/modules";
import {
  BASIC_ENTITLEMENTS,
  DEFAULT_LIMITS,
  settableOf,
} from "@faridalms/domain/plans";
import { Badge } from "@faridalms/ui/badge";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { FieldDescription, FieldLegend, FieldSet } from "@faridalms/ui/field";
import { Input } from "@faridalms/ui/input";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { CreateSchoolOutcome } from "../server/directory";

import { failure } from "../actions";
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
  loader: () => getNewSchool(),
  component: NewSchool,
});

const GIB = 1024 * 1024 * 1024;

function NewSchool() {
  const { cells, drafts } = Route.useLoaderData();
  return drafts ? <Drafts drafts={drafts} /> : <ByHand cells={cells} />;
}

type Data = Awaited<ReturnType<typeof getNewSchool>>;

/**
 * Where the console sells what it creates, a school is set up as a draft:
 * for a customer, with a plan, step by step, resumed where it was left.
 */
function Drafts({ drafts }: { drafts: NonNullable<Data["drafts"]> }) {
  const navigate = useNavigate();
  const start = useServerFn(startNewDraft);
  const [starting, setStarting] = useState(false);
  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          Schools
        </Link>
        <h1 className="text-2xl font-semibold">New school</h1>
        <p className="text-sm text-muted-foreground">
          A school is set up for a customer in six steps: the customer, its
          schools, what it buys, its addresses, the people who first run it, and
          a last look before it is created. Each step is kept as you leave it,
          so a draft can be finished later or by someone else.
        </p>
      </div>
      <Button
        className="justify-self-start"
        disabled={starting}
        onClick={async () => {
          setStarting(true);
          try {
            const { id } = await start();
            await navigate({
              to: "/provisioning/$draftId",
              params: { draftId: id },
            });
          } catch (error) {
            const said = failure(error, "A draft could not be started.");
            if (said) toast.error(said);
          } finally {
            setStarting(false);
          }
        }}
      >
        {starting ? "Starting…" : "Start a new school"}
      </Button>
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">Drafts</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drafts.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {drafts.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <Link
                  to="/provisioning/$draftId"
                  params={{ draftId: draft.id }}
                  className="font-medium underline"
                >
                  {draft.schools.filter(Boolean).join(", ") || "Unnamed school"}
                </Link>
                <span className="text-muted-foreground">
                  {draft.customerName ?? "No customer yet"} · at{" "}
                  {DRAFT_STEP_NAMES[draft.step]} · {formatWhen(draft.updatedAt)}
                </span>
                {draft.started ? (
                  <Badge variant="outline">Creating began</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Where the console runs without its business database, a school is
 * created in one form with what it is entitled to.
 */
function ByHand({ cells }: { cells: Data["cells"] }) {
  const create = useServerFn(createSchool);
  const [outcome, setOutcome] = useState<CreateSchoolOutcome | null>(null);
  const [modules, setModules] = useState<ModuleId[]>([...BASIC_MODULES]);
  const [poolGb, setPoolGb] = useState("");
  const [formKey, setFormKey] = useState(0);

  if (outcome?.ok)
    return (
      <div className="grid max-w-2xl gap-6" aria-live="polite">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">School created</h1>
          <Sent sent={outcome.sent} />
          {outcome.created ? null : (
            <p className="text-sm text-muted-foreground">
              An earlier attempt had already created the school in its cell, so
              this sent its administrators new links.
            </p>
          )}
          {outcome.activated ? null : (
            <p role="alert" className="text-sm text-destructive">
              The directory still shows the school as provisioning. Submit the
              same details again to finish.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/schools/$schoolId"
            params={{ schoolId: outcome.schoolId }}
            className={buttonVariants()}
          >
            Open the school
          </Link>
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
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          Schools
        </Link>
        <h1 className="text-2xl font-semibold">New school</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Creates a school, or a group with its schools, in a cell, and emails
          each school's first administrator a link to choose a password.
          Everything else the school sets up itself.
        </p>
      </div>
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
        submittingLabel="Creating the school…"
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
        <FieldSet>
          <FieldLegend>Entitlements</FieldLegend>
          <FieldDescription>
            Basic and the default storage unless you choose more. Each school
            gets the same, which its page can change later.
          </FieldDescription>
          <div className="grid max-w-xs gap-1.5 text-sm">
            <label htmlFor="plan-pool" className="font-medium">
              School pool in GB
            </label>
            <Input
              id="plan-pool"
              inputMode="decimal"
              value={poolGb}
              placeholder="Default"
              onChange={(event) => setPoolGb(event.target.value)}
            />
          </div>
          <ModuleFields prefix="plan" modules={modules} onChange={setModules} />
        </FieldSet>
      </SchoolSpecForm>
    </div>
  );
}
