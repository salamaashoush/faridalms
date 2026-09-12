import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
} from "~/components/app/primitives";
import { StudentSwitcher } from "~/components/app/StudentSwitcher";
import { initialsOf } from "~/components/app/UserMenu";
import { ageOn, formatDate } from "~/components/family/format";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import {
  familyOverviewQuery,
  studentQuery,
  visibleStudentsQuery,
} from "~/queries/school";
import { studentScopedQuerySchema } from "~/schema/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/family/children")({
  validateSearch: (search) => v.parse(studentScopedQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(studentQuery(deps)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
      context.queryClient.ensureQueryData(familyOverviewQuery),
    ]);
  },
  component: ChildProfilePage,
});

function ChildProfilePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { today, profile } = useSuspenseQuery(studentQuery(search)).data;
  const { schoolYear } = useSuspenseQuery(familyOverviewQuery).data;

  const age = ageOn(profile.birthdate, today);
  const contact = profile.contact;
  const medical = profile.medical;

  return (
    <>
      <PageHeader
        title={profile.fullName}
        description={m.familyChildrenSubtitle()}
        actions={
          <StudentSwitcher
            value={search.studentId}
            onChange={(studentId) => {
              void navigate({ search: (prev) => ({ ...prev, studentId }) });
            }}
          />
        }
      />

      <Tabs defaultValue="information" className="gap-4">
        <TabsList>
          <TabsTrigger value="information">
            {m.studentInformation()}
          </TabsTrigger>
          <TabsTrigger value="contact">{m.studentContact()}</TabsTrigger>
          <TabsTrigger value="medical">{m.studentMedical()}</TabsTrigger>
        </TabsList>

        <TabsContent value="information">
          <SectionCard title={m.studentInformation()}>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar className="size-24 shrink-0">
                {profile.photoUrl ? (
                  <AvatarImage
                    src={profile.photoUrl}
                    alt={m.familyPhotoAlt({ name: profile.fullName })}
                  />
                ) : null}
                <AvatarFallback className="text-2xl font-semibold">
                  {initialsOf(profile.fullName)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <FieldGrid>
                  <Field label={m.familyReference()}>{profile.reference}</Field>
                  <Field label={m.studentGrade()}>{profile.grade}</Field>
                  <Field label={m.studentClass()}>{profile.className}</Field>
                  <Field label={m.studentBirthdate()}>
                    {profile.birthdate ? formatDate(profile.birthdate) : null}
                  </Field>
                  <Field label={m.studentAge()}>
                    {age
                      ? m.studentAgeValue({
                          years: formatNumber(age.years),
                          months: formatNumber(age.months),
                        })
                      : null}
                  </Field>
                  <Field label={m.studentHomeroom()}>
                    {profile.homeroomTeacher}
                  </Field>
                  <Field label={m.studentSchoolYear()}>{schoolYear}</Field>
                </FieldGrid>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="contact">
          <div className="flex flex-col gap-6">
            <SectionCard title={m.studentContact()}>
              <FieldGrid>
                <Field label={m.studentEmail()}>{contact?.email}</Field>
                <Field label={m.studentFatherMobile()}>
                  {contact?.fatherMobile}
                </Field>
                <Field label={m.studentMotherMobile()}>
                  {contact?.motherMobile}
                </Field>
                <Field label={m.studentContactMobile()}>
                  {contact?.contactMobile}
                </Field>
                <Field label={m.studentFatherAddress()}>
                  {contact?.fatherAddress}
                </Field>
                <Field label={m.studentMotherAddress()}>
                  {contact?.motherAddress}
                </Field>
              </FieldGrid>
            </SectionCard>

            <SectionCard title={m.studentEmergency()}>
              {profile.emergencyContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {m.familyNoEmergencyContacts()}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {profile.emergencyContacts.map((entry) => (
                    <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
                      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
                        <Field label={m.familyContactName()}>
                          {entry.name}
                        </Field>
                        <Field label={m.familyMobile()}>{entry.mobile}</Field>
                        <Field label={m.studentRelation()}>
                          {entry.relation}
                        </Field>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="medical">
          <div className="flex flex-col gap-6">
            <SectionCard title={m.studentMedical()}>
              <FieldGrid>
                <Field label={m.studentBloodGroup()}>
                  {medical?.bloodGroup}
                </Field>
                <Field label={m.studentAllergies()}>{medical?.allergies}</Field>
                <Field label={m.studentInjuries()}>
                  {medical?.pastInjuries}
                </Field>
                <Field label={m.studentSurgeries()}>{medical?.surgeries}</Field>
                <Field label={m.studentMedicineAgreement()}>
                  {medical
                    ? medical.medicineAgreement
                      ? m.studentMedicineAgreed()
                      : m.studentMedicineNotAgreed()
                    : null}
                </Field>
              </FieldGrid>
            </SectionCard>

            <SectionCard title={m.studentMedicalReports()}>
              {profile.medicalReports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {m.familyNoMedicalReports()}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {profile.medicalReports.map((report) => (
                    <li
                      key={report.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {report.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span>{m.familyUploadedOn()}</span>{" "}
                          <span>{formatDate(report.uploadedOn)}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <a href={report.url} target="_blank" rel="noreferrer">
                            {m.commonOpen()}
                          </a>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
