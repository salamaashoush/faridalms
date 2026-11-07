import type { OpenCell } from "@faridalms/database/directory/admin";
import type {
  AdministratorInput,
  TenantSpecInput,
} from "@faridalms/domain/provisioning";
import type { FormValidateOrFn } from "@tanstack/react-form";
import type { ReactNode } from "react";

import {
  newSchoolSchema,
  tenantSpecSchema,
} from "@faridalms/domain/provisioning";
import { Button } from "@faridalms/ui/button";
import {
  CheckboxGroupField,
  FieldError,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { FormSection } from "@faridalms/ui/system/record-form";
import { TimeZoneField } from "@faridalms/ui/system/time-zone-field";
import { useForm, useStore } from "@tanstack/react-form";
import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

const KIND_OPTIONS = [
  { value: "school", label: "A standalone school" },
  { value: "school_group", label: "A school group with one or more schools" },
] as const;

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

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

/**
 * The tenant and its people, as one form or a step of a longer one: what a
 * school or group is and where it runs, and each school's first
 * administrator with a group's own. A step that shows only the tenant
 * checks only the tenant.
 */
/** Which parts of the form a step shows. */
export interface SchoolSpecSections {
  tenant: boolean;
  people: boolean;
}

export interface SchoolSpecFormProps {
  /** The form's name, for whoever reads the page by its forms. */
  label: string;
  sections: SchoolSpecSections;
  cells: OpenCell[];
  initial: SchoolSpecValues;
  takenSlugs?: string[];
  submitLabel: string;
  answer: string | null;
  onSubmit: (value: SchoolSpecValues) => Promise<void>;
  /** More of the form, after the people and before submitting. */
  children?: ReactNode;
  /** Beside the submit button, such as going back a step. */
  actions?: ReactNode;
}

export function SchoolSpecForm({
  label,
  sections,
  cells,
  initial,
  takenSlugs = NO_SLUGS,
  submitLabel,
  answer,
  onSubmit,
  children,
  actions,
}: SchoolSpecFormProps) {
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
      className="grid gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {sections.tenant ? (
        <>
          <FormSection title="What it is">
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
                <SelectField
                  id="kind"
                  label="Kind"
                  value={field.state.value}
                  options={KIND_OPTIONS}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            {kind === "school_group" ? (
              <div className="grid items-start gap-6 sm:grid-cols-2">
                <form.Field name="nameEn">
                  {(field) => (
                    <TextField
                      id="group-name-en"
                      label="Group name in English"
                      value={field.state.value ?? ""}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
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
                      value={field.state.value ?? ""}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                      maxLength={160}
                    />
                  )}
                </form.Field>
              </div>
            ) : null}
          </FormSection>

          <form.Field name="schools" mode="array">
            {(rows) => (
              <FormSection
                title={kind === "school_group" ? "Schools" : "School"}
              >
                {rows.state.value.map((_, index) => (
                  <div
                    key={rowKeys[index] ?? index}
                    className="grid items-start gap-6 rounded-lg border bg-card p-5 sm:grid-cols-2"
                  >
                    <form.Field name={`schools[${index}].nameEn`}>
                      {(field) => (
                        <TextField
                          id={`school-${index}-name-en`}
                          label="Name in English"
                          value={field.state.value ?? ""}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
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
                          value={field.state.value ?? ""}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
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
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
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
                        <TimeZoneField
                          label="Time zone"
                          hint="Search by city, such as Cairo or Dubai."
                          searchLabel="Search time zones…"
                          value={field.state.value}
                          onChange={field.handleChange}
                          errors={field.state.meta.errors}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`schools[${index}].countryCode`}>
                      {(field) => (
                        <TextField
                          id={`school-${index}-country`}
                          label="Country"
                          hint="Two letters, such as EG. It sets the school's week and the privacy law families' requests follow."
                          dir="ltr"
                          maxLength={2}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
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
              </FormSection>
            )}
          </form.Field>

          <FormSection title="Where it runs">
            <div className="grid items-start gap-6 sm:grid-cols-2">
              <form.Field name="cellId">
                {(field) => (
                  <SelectField
                    id="cell"
                    label="Cell"
                    value={field.state.value}
                    options={cells.map((cell) => ({
                      value: cell.id,
                      label: `${cell.id} · ${cell.region} (${cell.appHost})`,
                    }))}
                    hint={
                      cells.length === 0
                        ? "No cell is open for new schools."
                        : undefined
                    }
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
              <form.Field name="defaultLocale">
                {(field) => (
                  <SelectField
                    id="locale"
                    label="Default language"
                    hint="The administrators' emails are written in it."
                    value={field.state.value}
                    options={LOCALE_OPTIONS}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
              <form.Field name="jurisdictions">
                {(field) => (
                  <TextField
                    id="jurisdictions"
                    label="Jurisdictions"
                    hint="Where its data rules come from: two-letter codes separated by commas, such as EG, AE."
                    dir="ltr"
                    value={jurisdictions}
                    onChange={(event) => {
                      setJurisdictions(event.target.value);
                      field.handleChange(parseCodes(event.target.value));
                    }}
                    onBlur={field.handleBlur}
                    errors={field.state.meta.errors}
                  />
                )}
              </form.Field>
            </div>
          </FormSection>
        </>
      ) : null}

      {sections.people ? (
        <>
          {schools.map((school, index) => (
            <FormSection
              key={rowKeys[index] ?? index}
              title={
                schools.length > 1
                  ? `Administrator of ${school.nameEn || school.nameAr || `school ${index + 1}`}`
                  : "First administrator"
              }
              description="They hold every capability at the school and add everyone else."
            >
              <div className="grid items-start gap-6 sm:grid-cols-2">
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
                        value={field.state.value ?? ""}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
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
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
              </div>
            </FormSection>
          ))}
          <form.Field name="administrators">
            {(field) =>
              field.state.meta.errors.length > 0 ? (
                <FieldError errors={field.state.meta.errors} />
              ) : null
            }
          </form.Field>
          {kind === "school_group" ? (
            <FormSection title="Group administrator">
              <CheckboxGroupField
                label="Who runs the group"
                value={hasGroupAdministrator ? ["on"] : []}
                options={[
                  {
                    value: "on",
                    label: "Someone runs every school of the group",
                  },
                ]}
                onChange={(value) =>
                  form.setFieldValue(
                    "groupAdministrator",
                    value.includes("on") ? blankPerson() : null,
                  )
                }
              />
              {hasGroupAdministrator ? (
                <div className="grid items-start gap-6 sm:grid-cols-2">
                  {NAME_FIELDS.map(([key, name, dir]) => (
                    <form.Field key={key} name={`groupAdministrator.${key}`}>
                      {(field) => (
                        <TextField
                          id={`group-admin-${key}`}
                          label={name}
                          dir={dir}
                          lang={dir === "rtl" ? "ar" : undefined}
                          value={field.state.value ?? ""}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
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
                        value={field.state.value ?? ""}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        onBlur={field.handleBlur}
                        errors={field.state.meta.errors}
                      />
                    )}
                  </form.Field>
                </div>
              ) : null}
            </FormSection>
          ) : null}
        </>
      ) : null}

      {children}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <FormFooter
            submitLabel={submitLabel}
            pending={submitting}
            disabled={!hydrated || cells.length === 0}
            error={answer}
            secondary={actions}
          />
        )}
      </form.Subscribe>
    </form>
  );
}
