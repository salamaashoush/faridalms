import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import {
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { initialsOf } from "~/components/app/UserMenu";
import { ageOn, formatDate } from "~/components/family/format";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import { studentQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export function StudentProfile({
  studentId,
  tab,
  onTab,
}: {
  studentId: string;
  tab: string;
  onTab: (tab: "information" | "contact" | "medical") => void;
}) {
  const { today, profile, access } = useSuspenseQuery(
    studentQuery({ studentId }),
  ).data;

  const age = ageOn(profile.birthdate, today);
  const contact = profile.contact;
  const medical = profile.medical;

  return (
    <>
      <PageHeader
        title={profile.fullName}
        description={m.familyChildrenSubtitle()}
        actions={
          access.manage ? (
            <ButtonLink to="/student-editor" search={{ id: studentId }}>
              <Pencil className="size-4" aria-hidden />
              {m.managementEditStudent()}
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="outline">
          {m.familyReference()}: {profile.reference}
        </Badge>
        {profile.classId ? (
          <Link
            to="/classes/$classId"
            params={{ classId: profile.classId }}
            search={{}}
            className="font-medium text-primary hover:underline"
          >
            {profile.className}
          </Link>
        ) : null}
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (
            value === "information" ||
            value === "contact" ||
            value === "medical"
          )
            onTab(value);
        }}
        className="gap-6"
      >
        {/* The three labels are wider than a phone, and TabsList is vendored
            registry code, so the scroll belongs on a wrapper we own. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            <TabsTrigger value="information">
              {m.studentInformation()}
            </TabsTrigger>
            {access.contacts ? (
              <TabsTrigger value="contact">{m.studentContact()}</TabsTrigger>
            ) : null}
            {access.medical ? (
              <TabsTrigger value="medical">{m.studentMedical()}</TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="information" className="space-y-6">
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
                  <Field label={m.studentClass()}>
                    {profile.classId ? (
                      <Link
                        to="/classes/$classId"
                        params={{ classId: profile.classId }}
                        search={{}}
                        className="text-primary hover:underline"
                      >
                        {profile.className}
                      </Link>
                    ) : null}
                  </Field>
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
                </FieldGrid>
              </div>
            </div>
          </SectionCard>
          <SectionCard
            title={m.enrollmentHistoryTitle()}
            description={m.enrollmentHistoryHint()}
          >
            {profile.enrollmentHistory.length ? (
              <ol className="divide-y">
                {profile.enrollmentHistory.map((enrollment) => (
                  <li
                    key={enrollment.id}
                    className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-2"
                  >
                    <div>
                      <p className="text-sm text-muted-foreground">
                        <Value>{enrollment.schoolYear}</Value>
                      </p>
                      <p className="mt-1 font-medium">
                        {enrollment.canOpenClass ? (
                          <Link
                            to="/classes/$classId"
                            params={{ classId: enrollment.classId }}
                            search={{}}
                            className="text-primary hover:underline"
                          >
                            <Value>{enrollment.className}</Value>
                          </Link>
                        ) : (
                          <Value>{enrollment.className}</Value>
                        )}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-muted-foreground">
                          {m.enrollmentStarts()}
                        </dt>
                        <dd className="mt-1">{formatDate(enrollment.since)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {m.enrollmentEnds()}
                        </dt>
                        <dd className="mt-1">
                          {enrollment.until
                            ? formatDate(enrollment.until)
                            : m.enrollmentNoEnd()}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {m.enrollmentHistoryEmpty()}
              </p>
            )}
          </SectionCard>
        </TabsContent>

        {access.contacts ? (
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

              <SectionCard title={m.recordGuardians()}>
                <ul className="divide-y">
                  {profile.guardians.map((guardian) => (
                    <li
                      key={guardian.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span className="font-medium">{guardian.name}</span>
                      <a
                        className="text-sm text-primary hover:underline"
                        href={`mailto:${guardian.email}`}
                      >
                        {guardian.email}
                      </a>
                    </li>
                  ))}
                </ul>
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
        ) : null}

        {access.medical ? (
          <TabsContent value="medical">
            <div className="flex flex-col gap-6">
              <SectionCard title={m.studentMedical()}>
                <FieldGrid>
                  <Field label={m.studentBloodGroup()}>
                    {medical?.bloodGroup}
                  </Field>
                  <Field label={m.studentAllergies()}>
                    {medical?.allergies}
                  </Field>
                  <Field label={m.studentInjuries()}>
                    {medical?.pastInjuries}
                  </Field>
                  <Field label={m.studentSurgeries()}>
                    {medical?.surgeries}
                  </Field>
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
                            <a
                              href={report.url}
                              target="_blank"
                              rel="noreferrer"
                            >
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
        ) : null}
      </Tabs>
    </>
  );
}
