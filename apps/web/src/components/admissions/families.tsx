import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection } from "@faridalms/ui/system/record-form";
import { Fact, Facts, RecordSection } from "@faridalms/ui/system/record-page";
import { Plus, Trash2 } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { portalSentence } from "~/components/auth/portal-words";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

import type { ApplicationContactProps, ApplicationStepProps } from "./slots";

import { ContactFacts } from "./ApplicationContact";
import { hasName, NamesFields, noNames } from "./apply-parts";
import { applicationContacts, applicationSteps, enrolNotes } from "./slots";

const label = (
  value: { labelEn: string | null; labelAr: string | null } | null,
) => (value ? inLocale(value.labelEn, value.labelAr) : "");

/**
 * Who the person applying is to the applicant, that they hold parental
 * responsibility, and the other parent or guardian, so the school can
 * reach both.
 */
function FamilyStep({ form, onChange, options, tried }: ApplicationStepProps) {
  const relations = [
    { value: "", label: m.applyChoose() },
    ...options.relations.map((row) => ({
      value: row.id,
      label: inLocale(row.labelEn, row.labelAr),
    })),
  ];
  const other = form.other;
  return (
    <>
      <SelectField
        id="family-relation"
        label={m.applyYourRelation()}
        value={form.relationId ?? ""}
        options={relations}
        onChange={(relationId) => onChange({ ...form, relationId })}
        errors={tried && !form.relationId ? [m.applyErrRelation()] : undefined}
        width="name"
      />
      <TextField
        id="family-phone"
        label={m.applyYourPhone()}
        optional
        type="tel"
        dir="ltr"
        width="phone"
        value={form.phone ?? ""}
        onChange={(event) => onChange({ ...form, phone: event.target.value })}
      />
      <fieldset
        className="grid gap-2"
        aria-describedby="family-responsible-hint"
        data-invalid={tried && !form.responsible ? true : undefined}
      >
        <legend className="text-sm leading-5 font-medium">
          {m.applyResponsible()}
        </legend>
        <p
          id="family-responsible-hint"
          className="text-[13px] leading-[18px] text-muted-foreground"
        >
          {m.applyResponsibleHint()}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.responsible}
            onCheckedChange={(responsible) =>
              onChange({ ...form, responsible })
            }
          />
          {m.applyResponsibleYes()}
        </label>
        {tried && !form.responsible ? (
          <p className="text-[13px] leading-[18px] text-destructive">
            {m.applyErrResponsible()}
          </p>
        ) : null}
      </fieldset>
      <FormSection title={m.applyOtherTitle()} description={m.applyOtherHint()}>
        {other ? (
          <>
            <SelectField
              id="other-relation"
              label={m.aplFieldRelation()}
              value={other.relationId}
              options={relations}
              onChange={(relationId) =>
                onChange({ ...form, other: { ...other, relationId } })
              }
              errors={
                tried && !other.relationId ? [m.applyErrRelation()] : undefined
              }
              width="name"
            />
            <NamesFields
              id="other"
              names={other.names}
              onChange={(names) =>
                onChange({ ...form, other: { ...other, names } })
              }
              error={tried && !hasName(other.names) ? m.applyErrName() : null}
            />
            <div className="flex flex-wrap gap-4">
              <TextField
                id="other-email"
                label={m.admFieldEmail()}
                optional
                type="email"
                dir="ltr"
                width="name"
                value={other.email ?? ""}
                onChange={(event) =>
                  onChange({
                    ...form,
                    other: { ...other, email: event.target.value },
                  })
                }
              />
              <TextField
                id="other-phone"
                label={m.admFieldPhone()}
                optional
                type="tel"
                dir="ltr"
                width="phone"
                value={other.phone ?? ""}
                onChange={(event) =>
                  onChange({
                    ...form,
                    other: { ...other, phone: event.target.value },
                  })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={other.livesWithChild}
                onCheckedChange={(livesWithChild) =>
                  onChange({ ...form, other: { ...other, livesWithChild } })
                }
              />
              {m.applyLivesWith()}
            </label>
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start"
              onClick={() => onChange({ ...form, other: null })}
            >
              <Trash2 aria-hidden className="size-4" />
              {m.applyOtherRemove()}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              onChange({
                ...form,
                other: {
                  relationId: "",
                  names: noNames(),
                  email: "",
                  phone: "",
                  livesWithChild: true,
                },
              })
            }
          >
            <Plus aria-hidden className="size-4" />
            {m.applyOtherAdd()}
          </Button>
        )}
      </FormSection>
    </>
  );
}

/** Who applied, as the family wrote it, with the other parent or guardian. */
function FamilySection({ row }: ApplicationContactProps) {
  return (
    <RecordSection
      title={m.aplSectionFamily()}
      description={m.aplSectionFamilyHint()}
    >
      <Facts>
        <Fact label={m.aplFieldApplicant()}>
          <bdi>{inLocale(row.family.nameEn, row.family.nameAr)}</bdi>
        </Fact>
        <Fact label={m.aplFieldRelation()}>{label(row.family.relation)}</Fact>
        <Fact label={m.aplFieldResponsible()}>
          {row.family.responsible ? m.aplYes() : m.aplNo()}
        </Fact>
        <ContactFacts email={row.family.email} phone={row.family.phone} />
      </Facts>
      {row.other ? (
        <div className="mt-6 border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold">{m.aplOtherGuardian()}</h3>
          <Facts>
            <Fact label={m.aplFieldName()}>
              <bdi>
                {inLocale(
                  [row.other.names.en.given, row.other.names.en.family]
                    .filter(Boolean)
                    .join(" ") || null,
                  [
                    row.other.names.ar.given,
                    row.other.names.ar.middle,
                    row.other.names.ar.family,
                  ]
                    .filter(Boolean)
                    .join(" ") || null,
                )}
              </bdi>
            </Fact>
            <Fact label={m.aplFieldRelation()}>
              {label(row.other.relation)}
            </Fact>
            <Fact label={m.aplFieldLivesWith()}>
              {row.other.livesWithChild ? m.aplYes() : m.aplNo()}
            </Fact>
            <ContactFacts
              email={row.other.email || null}
              phone={row.other.phone || null}
            />
          </Facts>
        </div>
      ) : null}
    </RecordSection>
  );
}

/**
 * Applying for someone in one's care, where the school keeps families: the
 * application asks who the person applying is to the applicant and names
 * the other parent or guardian, the office reads the family as it wrote,
 * enrolling makes the family the learner's guardians, and every sentence
 * of admissions speaks of the family.
 */
export const ADMISSIONS_WITH_FAMILIES: ModuleFillings = {
  module: "admissions",
  needs: ["families"],
  fillings: [
    fill(applicationSteps, {
      id: "family",
      after: "child",
      label: m.applyStepFamily,
      valid: (form) =>
        Boolean(form.relationId) &&
        form.responsible &&
        (!form.other ||
          (hasName(form.other.names) && Boolean(form.other.relationId))),
      Step: FamilyStep,
    }),
    fill(applicationContacts, FamilySection),
    fill(enrolNotes, m.decEnrolFamily),
    portalSentence("families", m.portalRegisterLeadCore, m.portalRegisterLead),
    portalSentence("families", m.applyGateBodyCore, m.applyGateBody),
    replaceWords(m.admHintCore, m.admHint),
    replaceWords(m.admColFamilyCore, m.admColFamily),
    replaceWords(m.admReasonNoResponseCore, m.admReasonNoResponse),
    replaceWords(m.admConvertBodyCore, m.admConvertBody),
    replaceWords(m.admSectionAnswersHintCore, m.admSectionAnswersHint),
    replaceWords(m.admRelatedNoneCore, m.admRelatedNone),
    replaceWords(m.aplWithdrawFamilyCore, m.aplWithdrawFamily),
    replaceWords(m.itkHintCore, m.itkHint),
    replaceWords(m.itkConsentsMissingCore, m.itkConsentsMissing),
    replaceWords(m.itkSectionChecklistHintCore, m.itkSectionChecklistHint, [
      "grade_levels",
    ]),
    replaceWords(m.itkChecklistTableCore, m.itkChecklistTable),
    replaceWords(m.itkSectionFeesHintCore, m.itkSectionFeesHint),
    replaceWords(m.itkItemRemoveBodyCore, m.itkItemRemoveBody),
    replaceWords(m.itkFeeClearBodyCore, m.itkFeeClearBody),
    replaceWords(m.itkFieldOfferDaysHintCore, m.itkFieldOfferDaysHint),
    replaceWords(m.afmEmptyBodyCore, m.afmEmptyBody),
    replaceWords(m.afmEditorHintCore, m.afmEditorHint),
    replaceWords(m.aplHintCore, m.aplHint),
    replaceWords(m.aplSearchPlaceholderCore, m.aplSearchPlaceholder),
    replaceWords(m.aplEmptyBodyCore, m.aplEmptyBody),
    replaceWords(m.aplSectionChecklistHintCore, m.aplSectionChecklistHint),
    replaceWords(m.aplNeedsDeclaredCore, m.aplNeedsDeclared),
    replaceWords(m.aplSectionConversationCore, m.aplSectionConversation),
    replaceWords(
      m.aplSectionConversationHintCore,
      m.aplSectionConversationHint,
    ),
    replaceWords(m.aplSectionHistoryHintCore, m.aplSectionHistoryHint),
    replaceWords(m.aplSectionMatchesHintCore, m.aplSectionMatchesHint),
    replaceWords(m.aplMatchApplicantCore, m.aplMatchApplicant),
    replaceWords(m.aplMatchStaffCore, m.aplMatchStaff),
    replaceWords(m.aplMatchesLaterCore, m.aplMatchesLater),
    replaceWords(m.aplSectionChildCore, m.aplSectionChild),
    replaceWords(m.admEntryAppliedCore, m.admEntryApplied),
    replaceWords(m.admEraseActionCore, m.admEraseAction),
    replaceWords(m.admErasedCore, m.admErased),
    replaceWords(
      m.admSectionConversationHintCore,
      m.admSectionConversationHint,
    ),
    replaceWords(m.aplConversationStartCore, m.aplConversationStart),
    replaceWords(m.adrByOriginCore, m.adrByOrigin),
    replaceWords(m.brdReleaseBodyCore, m.brdReleaseBody),
    replaceWords(m.brdOfferBodyCore, m.brdOfferBody),
    replaceWords(m.brdEnrolBodyCore, m.brdEnrolBody, [
      "school_years",
      "grade_levels",
    ]),
    replaceWords(m.decDecisionOfferHintCore, m.decDecisionOfferHint),
    replaceWords(m.decDecisionDeclineHintCore, m.decDecisionDeclineHint),
    replaceWords(m.decRefuseBodyCore, m.decRefuseBody),
    replaceWords(m.decAnsweredCore, m.decAnswered),
    replaceWords(m.decAnswerTitleCore, m.decAnswerTitle),
    replaceWords(m.decAnswerLabelCore, m.decAnswerLabel),
    replaceWords(m.decAnswerSavedCore, m.decAnswerSaved),
    replaceWords(m.decLettersHintCore, m.decLettersHint),
    replaceWords(m.ltrFieldsHintCore, m.ltrFieldsHint),
    replaceWords(m.ltrFieldFamilyCore, m.ltrFieldFamily),
    replaceWords(m.ltrFieldChildCore, m.ltrFieldChild),
    replaceWords(m.setupAdmissionsBodyCore, m.setupAdmissionsBody, [
      "grade_levels",
    ]),
    replaceWords(m.applyStepChildCore, m.applyStepChild),
    replaceWords(m.applyIntakeHintCore, m.applyIntakeHint, ["grade_levels"]),
    replaceWords(m.applySchoolsHintCore, m.applySchoolsHint),
    replaceWords(m.applySchoolLeavingCore, m.applySchoolLeaving),
    replaceWords(m.applyNotFamilyTitleCore, m.applyNotFamilyTitle),
    replaceWords(m.applyNotFamilyBodyCore, m.applyNotFamilyBody),
    replaceWords(m.famOfferAcceptBodyCore, m.famOfferAcceptBody),
    replaceWords(m.famOfferDeclineBodyCore, m.famOfferDeclineBody),
  ],
};
