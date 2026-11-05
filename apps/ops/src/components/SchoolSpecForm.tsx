import type { OpenCell } from "@faridalms/database/directory/admin";
import type {
  AdministratorInput,
  TenantSpecInput,
} from "@faridalms/domain/provisioning";
import type { FormValidateOrFn } from "@tanstack/react-form";
import type { ComponentProps, ReactNode } from "react";

import {
  newSchoolSchema,
  tenantSpecSchema,
} from "@faridalms/domain/provisioning";
import { Button } from "@faridalms/ui/button";
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
import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

const SELECT =
  "h-9 w-full rounded-md border bg-background px-2 text-sm aria-invalid:border-destructive";

type Issues = ({ message?: string } | undefined)[];

/** A school or group's tenant and the people who first run it, as typed. */
export type SchoolSpecValues = TenantSpecInput & {
  administrators: AdministratorInput[];
  groupAdministrator?: AdministratorInput | null;
};

const asTyped = v.object({
  givenNameEn: v.optional(v.nullable(v.string())),
  familyNameEn: v.optional(v.nullable(v.string())),
  givenNameAr: v.optional(v.nullable(v.string())),
  familyNameAr: v.optional(v.nullable(v.string())),
  email: v.string(),
});

/** The tenant checked, its people carried as typed for a later step. */
const tenantStepSchema = v.intersect([
  tenantSpecSchema,
  v.object({
    administrators: v.array(asTyped),
    groupAdministrator: v.optional(v.nullable(asTyped)),
  }),
]);

export const blankSchool = (): TenantSpecInput["schools"][number] => ({
  nameEn: "",
  nameAr: "",
  slug: "",
  timeZone: "Africa/Cairo",
  countryCode: "EG",
});

export const blankPerson = (): AdministratorInput => ({
  givenNameEn: "",
  familyNameEn: "",
  givenNameAr: "",
  familyNameAr: "",
  email: "",
});

const NAME_FIELDS = [
  ["givenNameEn", "Given name in English", "ltr"],
  ["familyNameEn", "Family name in English", "ltr"],
  ["givenNameAr", "Given name in Arabic", "rtl"],
  ["familyNameAr", "Family name in Arabic", "rtl"],
] as const;

const NO_SLUGS: string[] = [];

const parseCodes = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter((code) => code !== "");

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

/**
 * The tenant and its people, as one form or a step of a longer one: what a
 * school or group is and where it runs, and each school's first
 * administrator with a group's own. A step that shows only the tenant
 * checks only the tenant.
 */
export function SchoolSpecForm({
  label,
  sections,
  cells,
  initial,
  takenSlugs = NO_SLUGS,
  submitLabel,
  submittingLabel,
  answer,
  onSubmit,
  children,
  actions,
}: {
  /** The form's name, for whoever reads the page by its forms. */
  label: string;
  sections: { tenant: boolean; people: boolean };
  cells: OpenCell[];
  initial: SchoolSpecValues;
  takenSlugs?: string[];
  submitLabel: string;
  submittingLabel: string;
  answer: string | null;
  onSubmit: (value: SchoolSpecValues) => Promise<void>;
  /** More of the form, after the people and before submitting. */
  children?: ReactNode;
  /** Beside the submit button, such as going back a step. */
  actions?: ReactNode;
}) {
  const hydrated = useHydrated();
  const [jurisdictions, setJurisdictions] = useState(
    initial.jurisdictions.join(", "),
  );
  // Schools have no id until the cell creates them, so each row gets a key
  // of its own that survives removing the one above it.
  const [rowKeys, setRowKeys] = useState(() =>
    initial.schools.map(() => crypto.randomUUID()),
  );
  const validator: FormValidateOrFn<SchoolSpecValues> = sections.people
    ? newSchoolSchema
    : tenantStepSchema;
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: validator },
    onSubmit: ({ value }) => onSubmit(value),
  });
  const kind = useStore(form.store, (state) => state.values.kind);
  const schools = useStore(form.store, (state) => state.values.schools);
  const hasGroupAdministrator = useStore(form.store, (state) =>
    Boolean(state.values.groupAdministrator),
  );

  return (
    <form
      noValidate
      aria-label={label}
      className="grid max-w-3xl gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {sections.tenant ? (
        <>
          <FieldSet>
            <FieldLegend>What it is</FieldLegend>
            <FieldGroup>
              <form.Field
                name="kind"
                listeners={{
                  onChange: ({ value }) => {
                    if (value !== "school") return;
                    form.setFieldValue("schools", (rows) => rows.slice(0, 1));
                    form.setFieldValue("administrators", (rows) =>
                      rows.slice(0, 1),
                    );
                    form.setFieldValue("groupAdministrator", null);
                    setRowKeys((keys) => keys.slice(0, 1));
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
            {(rows) => (
              <FieldSet>
                <FieldLegend>
                  {kind === "school_group" ? "Schools" : "School"}
                </FieldLegend>
                {rows.state.value.map((_, index) => (
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
                            ...(takenSlugs.includes(
                              field.state.value.trim().toLowerCase(),
                            )
                              ? [
                                  {
                                    message: "Another school has this address.",
                                  },
                                ]
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
                    {rows.state.value.length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="self-end justify-self-start"
                        onClick={() => {
                          rows.removeValue(index);
                          form.setFieldValue("administrators", (people) =>
                            people.toSpliced(index, 1),
                          );
                          setRowKeys((keys) => keys.toSpliced(index, 1));
                        }}
                      >
                        Remove this school
                      </Button>
                    ) : null}
                  </div>
                ))}
                {rows.state.meta.errors.length > 0 ? (
                  <FieldError errors={rows.state.meta.errors} />
                ) : null}
                {kind === "school_group" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => {
                      rows.pushValue(blankSchool());
                      form.setFieldValue("administrators", (people) => [
                        ...people,
                        blankPerson(),
                      ]);
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
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
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
                      The administrators' emails are written in it.
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
        </>
      ) : null}

      {sections.people ? (
        <>
          {schools.map((school, index) => (
            <FieldSet key={rowKeys[index] ?? index}>
              <FieldLegend>
                {schools.length > 1
                  ? `Administrator of ${school.nameEn || school.nameAr || `school ${index + 1}`}`
                  : "First administrator"}
              </FieldLegend>
              <FieldDescription>
                They hold every capability at the school and add everyone else.
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                {NAME_FIELDS.map(([key, name, dir]) => (
                  <form.Field
                    key={key}
                    name={`administrators[${index}].${key}`}
                  >
                    {(field) => (
                      <TextField
                        id={`admin-${index}-${key}`}
                        label={name}
                        dir={dir}
                        lang={dir === "rtl" ? "ar" : undefined}
                        value={field.state.value}
                        onValueChange={field.handleChange}
                        onBlur={field.handleBlur}
                        errors={field.state.meta.errors}
                        maxLength={75}
                      />
                    )}
                  </form.Field>
                ))}
                <form.Field name={`administrators[${index}].email`}>
                  {(field) => (
                    <TextField
                      id={`admin-${index}-email`}
                      label="Email"
                      type="email"
                      dir="ltr"
                      autoComplete="off"
                      hint="Their sign-in name, and where their link goes."
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
              </div>
            </FieldSet>
          ))}
          <form.Field name="administrators">
            {(field) =>
              field.state.meta.errors.length > 0 ? (
                <FieldError errors={field.state.meta.errors} />
              ) : null
            }
          </form.Field>
          {kind === "school_group" ? (
            <FieldSet>
              <FieldLegend>Group administrator</FieldLegend>
              <span className="flex items-center gap-2 text-sm">
                <Checkbox
                  id="group-admin-on"
                  checked={hasGroupAdministrator}
                  onCheckedChange={(checked) =>
                    form.setFieldValue(
                      "groupAdministrator",
                      checked ? blankPerson() : null,
                    )
                  }
                />
                <label htmlFor="group-admin-on">
                  Someone runs every school of the group
                </label>
              </span>
              {hasGroupAdministrator ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {NAME_FIELDS.map(([key, name, dir]) => (
                    <form.Field key={key} name={`groupAdministrator.${key}`}>
                      {(field) => (
                        <TextField
                          id={`group-admin-${key}`}
                          label={name}
                          dir={dir}
                          lang={dir === "rtl" ? "ar" : undefined}
                          value={field.state.value}
                          onValueChange={field.handleChange}
                          onBlur={field.handleBlur}
                          errors={field.state.meta.errors}
                          maxLength={75}
                        />
                      )}
                    </form.Field>
                  ))}
                  <form.Field name="groupAdministrator.email">
                    {(field) => (
                      <TextField
                        id="group-admin-email"
                        label="Email"
                        type="email"
                        dir="ltr"
                        autoComplete="off"
                        hint="Their link opens at the group's first school."
                        value={field.state.value}
                        onValueChange={field.handleChange}
                        onBlur={field.handleBlur}
                        errors={field.state.meta.errors}
                      />
                    )}
                  </form.Field>
                </div>
              ) : null}
            </FieldSet>
          ) : null}
        </>
      ) : null}

      {children}

      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <span className="flex flex-wrap gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button
              type="submit"
              disabled={submitting || !hydrated || cells.length === 0}
            >
              {submitting ? submittingLabel : submitLabel}
            </Button>
          )}
        </form.Subscribe>
        {actions}
      </span>
    </form>
  );
}
