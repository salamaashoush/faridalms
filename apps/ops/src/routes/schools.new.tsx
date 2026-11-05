import type { ModuleId } from "@faridalms/domain/modules";
import type { NewSchoolInput } from "@faridalms/domain/provisioning";
import type { ComponentProps } from "react";

import { INVITE_DAYS } from "@faridalms/domain/first-sign-in";
import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import { newSchoolSchema } from "@faridalms/domain/provisioning";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@faridalms/ui/field";
import { Input } from "@faridalms/ui/input";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import type { CreateSchoolOutcome } from "../server/directory";

import { MODULE_NAMES } from "../format";
import { createSchool, listCells } from "../server/directory";

export const Route = createFileRoute("/schools/new")({
  loader: () => listCells(),
  component: NewSchool,
});

const GIB = 1024 * 1024 * 1024;
const SELECT =
  "h-9 w-full rounded-md border bg-background px-2 text-sm aria-invalid:border-destructive";

type Issues = ({ message?: string } | undefined)[];

function TextField({
  id,
  label,
  hint,
  errors,
  value,
  onValueChange,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  errors: Issues;
  value: string | null | undefined;
  onValueChange: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  const invalid = errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        value={value ?? ""}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={invalid}
        {...props}
      />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      {invalid ? <FieldError errors={errors} /> : null}
    </Field>
  );
}

const blankSchool = (): NewSchoolInput["schools"][number] => ({
  nameEn: "",
  nameAr: "",
  slug: "",
  timeZone: "Africa/Cairo",
  countryCode: "EG",
});

const parseCodes = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter((code) => code !== "");

function NewSchool() {
  const cells = Route.useLoaderData();
  const hydrated = useHydrated();
  const create = useServerFn(createSchool);
  const [outcome, setOutcome] = useState<CreateSchoolOutcome | null>(null);
  const [jurisdictions, setJurisdictions] = useState("EG");
  const [everyModule, setEveryModule] = useState(false);
  const [modules, setModules] = useState<ModuleId[]>([...BASIC_MODULES]);
  const [poolGb, setPoolGb] = useState("");
  // Schools have no id until the cell creates them, so each row gets a key
  // of its own that survives removing the one above it.
  const [rowKeys, setRowKeys] = useState(() => [crypto.randomUUID()]);
  const defaultValues: NewSchoolInput = {
    kind: "school",
    nameEn: "",
    nameAr: "",
    cellId: cells[0]?.id ?? "",
    defaultLocale: "en",
    jurisdictions: ["EG"],
    schools: [blankSchool()],
    administrator: {
      givenNameEn: "",
      familyNameEn: "",
      givenNameAr: "",
      familyNameAr: "",
      email: "",
    },
  };
  const form = useForm({
    defaultValues,
    validators: { onSubmit: newSchoolSchema },
    onSubmit: async ({ value }) => {
      const pool = Number(poolGb);
      const poolBytes =
        poolGb.trim() !== "" && Number.isFinite(pool) && pool > 0
          ? Math.round(pool * GIB)
          : null;
      const plan: NewSchoolInput["plan"] =
        everyModule && poolBytes === null
          ? null
          : {
              poolBytes,
              classBytes: null,
              moduleBytes: null,
              personBytes: null,
              modules: everyModule ? null : modules,
            };
      setOutcome(null);
      try {
        setOutcome(await create({ data: { ...value, plan } }));
      } catch {
        setOutcome({
          ok: false,
          takenSlugs: [],
          message: "The console could not save the school. Try again.",
        });
      }
    },
  });

  const kind = useStore(form.store, (state) => state.values.kind);

  if (outcome?.ok)
    return (
      <div className="grid max-w-2xl gap-6" aria-live="polite">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">School created</h1>
          <p className="text-sm">
            {outcome.sentTo} was emailed a link to choose a password. It works
            once, within {INVITE_DAYS} days, and they sign in as{" "}
            <span className="font-medium">{outcome.loginName}</span>.
          </p>
          {outcome.created ? null : (
            <p className="text-sm text-muted-foreground">
              An earlier attempt had already created the school in its cell, so
              this sent its administrator a new link.
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
              form.reset();
              setRowKeys([crypto.randomUUID()]);
              setJurisdictions("EG");
              setEveryModule(false);
              setModules([...BASIC_MODULES]);
              setPoolGb("");
              setOutcome(null);
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    );

  const taken = outcome?.ok === false ? outcome.takenSlugs : [];
  return (
    <form
      noValidate
      className="grid max-w-3xl gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-1">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          Schools
        </Link>
        <h1 className="text-2xl font-semibold">New school</h1>
        <p className="text-sm text-muted-foreground">
          Creates a school, or a group with its schools, in a cell, and emails
          its first administrator a link to choose a password. Everything else
          the school sets up itself.
        </p>
      </div>

      <FieldSet>
        <FieldLegend>What it is</FieldLegend>
        <FieldGroup>
          <form.Field
            name="kind"
            listeners={{
              onChange: ({ value }) => {
                if (value === "school")
                  form.setFieldValue("schools", (schools) =>
                    schools.slice(0, 1),
                  );
                if (value === "school") setRowKeys((keys) => keys.slice(0, 1));
              },
            }}
          >
            {(field) => (
              <Field>
                <FieldLabel htmlFor="kind">Kind</FieldLabel>
                <select
                  id="kind"
                  className={SELECT}
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value === "school_group"
                        ? "school_group"
                        : "school",
                    )
                  }
                >
                  <option value="school">A standalone school</option>
                  <option value="school_group">
                    A school group with one or more schools
                  </option>
                </select>
              </Field>
            )}
          </form.Field>
          {kind === "school_group" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="nameEn">
                {(field) => (
                  <TextField
                    id="group-name-en"
                    label="Group name in English"
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    onBlur={field.handleBlur}
                    errors={field.state.meta.errors}
                    maxLength={160}
                  />
                )}
              </form.Field>
              <form.Field name="nameAr">
                {(field) => (
                  <TextField
                    id="group-name-ar"
                    label="Group name in Arabic"
                    dir="rtl"
                    lang="ar"
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    onBlur={field.handleBlur}
                    errors={field.state.meta.errors}
                    maxLength={160}
                  />
                )}
              </form.Field>
            </div>
          ) : null}
        </FieldGroup>
      </FieldSet>

      <form.Field name="schools" mode="array">
        {(schools) => (
          <FieldSet>
            <FieldLegend>
              {kind === "school_group" ? "Schools" : "School"}
            </FieldLegend>
            {schools.state.value.map((_, index) => (
              <div
                key={rowKeys[index] ?? index}
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
              >
                <form.Field name={`schools[${index}].nameEn`}>
                  {(field) => (
                    <TextField
                      id={`school-${index}-name-en`}
                      label="Name in English"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                      maxLength={160}
                    />
                  )}
                </form.Field>
                <form.Field name={`schools[${index}].nameAr`}>
                  {(field) => (
                    <TextField
                      id={`school-${index}-name-ar`}
                      label="Name in Arabic"
                      dir="rtl"
                      lang="ar"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                      maxLength={160}
                    />
                  )}
                </form.Field>
                <form.Field name={`schools[${index}].slug`}>
                  {(field) => (
                    <TextField
                      id={`school-${index}-slug`}
                      label="Address"
                      hint="The school code people type to sign in, and its web address. It cannot change later."
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={[
                        ...field.state.meta.errors,
                        ...(taken.includes(
                          field.state.value.trim().toLowerCase(),
                        )
                          ? [{ message: "Another school has this address." }]
                          : []),
                      ]}
                    />
                  )}
                </form.Field>
                <form.Field name={`schools[${index}].timeZone`}>
                  {(field) => (
                    <TextField
                      id={`school-${index}-time-zone`}
                      label="Time zone"
                      hint="An IANA name, such as Africa/Cairo or Asia/Dubai."
                      dir="ltr"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
                <form.Field name={`schools[${index}].countryCode`}>
                  {(field) => (
                    <TextField
                      id={`school-${index}-country`}
                      label="Country"
                      hint="Two letters; it sets the school week."
                      dir="ltr"
                      maxLength={2}
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
                {schools.state.value.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="self-end justify-self-start"
                    onClick={() => {
                      schools.removeValue(index);
                      setRowKeys((keys) => keys.toSpliced(index, 1));
                    }}
                  >
                    Remove this school
                  </Button>
                ) : null}
              </div>
            ))}
            {schools.state.meta.errors.length > 0 ? (
              <FieldError errors={schools.state.meta.errors} />
            ) : null}
            {kind === "school_group" ? (
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={() => {
                  schools.pushValue(blankSchool());
                  setRowKeys((keys) => [...keys, crypto.randomUUID()]);
                }}
              >
                Add a school
              </Button>
            ) : null}
          </FieldSet>
        )}
      </form.Field>

      <FieldSet>
        <FieldLegend>Where it runs</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="cellId">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="cell">Cell</FieldLabel>
                <select
                  id="cell"
                  className={SELECT}
                  value={field.state.value}
                  aria-invalid={!field.state.meta.isValid}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  {cells.map((cell) => (
                    <option key={cell.id} value={cell.id}>
                      {cell.id} · {cell.region} ({cell.appHost})
                    </option>
                  ))}
                </select>
                {cells.length === 0 ? (
                  <FieldDescription>
                    No cell is open for new schools.
                  </FieldDescription>
                ) : null}
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="defaultLocale">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="locale">Default language</FieldLabel>
                <select
                  id="locale"
                  className={SELECT}
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value === "ar" ? "ar" : "en",
                    )
                  }
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
                <FieldDescription>
                  The administrator's email is written in it.
                </FieldDescription>
              </Field>
            )}
          </form.Field>
          <form.Field name="jurisdictions">
            {(field) => (
              <TextField
                id="jurisdictions"
                label="Jurisdictions"
                hint="Country codes whose rules apply, separated by commas."
                dir="ltr"
                value={jurisdictions}
                onValueChange={(text) => {
                  setJurisdictions(text);
                  field.handleChange(parseCodes(text));
                }}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>First administrator</FieldLegend>
        <FieldDescription>
          They hold every capability at the
          {kind === "school_group" ? " first" : ""} school and add everyone
          else.
        </FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="administrator.givenNameEn">
            {(field) => (
              <TextField
                id="admin-given-en"
                label="Given name in English"
                autoComplete="off"
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                maxLength={75}
              />
            )}
          </form.Field>
          <form.Field name="administrator.familyNameEn">
            {(field) => (
              <TextField
                id="admin-family-en"
                label="Family name in English"
                autoComplete="off"
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                maxLength={75}
              />
            )}
          </form.Field>
          <form.Field name="administrator.givenNameAr">
            {(field) => (
              <TextField
                id="admin-given-ar"
                label="Given name in Arabic"
                dir="rtl"
                lang="ar"
                autoComplete="off"
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                maxLength={75}
              />
            )}
          </form.Field>
          <form.Field name="administrator.familyNameAr">
            {(field) => (
              <TextField
                id="admin-family-ar"
                label="Family name in Arabic"
                dir="rtl"
                lang="ar"
                autoComplete="off"
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                maxLength={75}
              />
            )}
          </form.Field>
          <form.Field name="administrator.email">
            {(field) => (
              <TextField
                id="admin-email"
                label="Email"
                hint="The link goes here, and it becomes their sign-in name."
                type="email"
                dir="ltr"
                autoComplete="off"
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Plan</FieldLegend>
        <FieldDescription>
          Optional: leave both for the platform's defaults. Each school gets the
          same plan, which its page can change later.
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
        <div className="grid gap-3 text-sm">
          <span className="flex items-center gap-2">
            <Checkbox
              id="plan-every-module"
              checked={everyModule}
              onCheckedChange={(checked) => setEveryModule(checked)}
            />
            <label htmlFor="plan-every-module">
              Every module, including ones added later
            </label>
          </span>
          {everyModule
            ? null
            : MODULE_IDS.map((module) => (
                <span key={module} className="flex items-center gap-2 ps-6">
                  <Checkbox
                    id={`plan-module-${module}`}
                    checked={modules.includes(module)}
                    onCheckedChange={(checked) =>
                      setModules((current) =>
                        checked
                          ? [...current, module]
                          : current.filter((item) => item !== module),
                      )
                    }
                  />
                  <label htmlFor={`plan-module-${module}`}>
                    {MODULE_NAMES[module]}
                  </label>
                </span>
              ))}
        </div>
      </FieldSet>

      {outcome?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {outcome.message}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <Button
            type="submit"
            disabled={submitting || !hydrated || cells.length === 0}
            className="justify-self-start"
          >
            {submitting ? "Creating the school…" : "Create school"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
