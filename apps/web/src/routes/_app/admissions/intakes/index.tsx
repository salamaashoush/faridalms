import type { Column } from "@faridalms/ui/system/data-table";

import { intakeWindow } from "@faridalms/domain/admissions";
import { formQuestions } from "@faridalms/domain/questions";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { CalendarRange, FileText, Plus } from "lucide-react";
import * as v from "valibot";

import {
  named,
  WINDOW_LABEL,
  WINDOW_TONE,
} from "~/components/admissions/application-labels";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  formsQuery,
  intakeOptionsQuery,
  intakesQuery,
} from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

const searchSchema = v.object({
  year: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
  tab: v.optional(v.picklist(["intakes", "forms"]), "intakes"),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admissions/intakes/")({
  staticData: { breadcrumb: m.itkTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:configure");
    await Promise.all([
      context.queryClient.ensureQueryData(intakesQuery(deps.year)),
      context.queryClient.ensureQueryData(intakeOptionsQuery),
      context.queryClient.ensureQueryData(formsQuery),
    ]);
  },
  component: IntakesPage,
});

type Intake = Awaited<
  ReturnType<NonNullable<ReturnType<typeof intakesQuery>["queryFn"]>>
>["intakes"][number];
type Form = Awaited<
  ReturnType<NonNullable<(typeof formsQuery)["queryFn"]>>
>["forms"][number];

interface GradeProps {
  row: Intake;
}

/** An intake opens its board, where its applications are worked through. */
function Grade({ row }: GradeProps) {
  return (
    <RowLink
      to="/admissions/intakes/$intakeId"
      params={{ intakeId: row.id }}
      className="justify-self-start"
    >
      {inLocale(row.gradeEn, row.gradeAr)}
    </RowLink>
  );
}

function intakeColumns(today: string): Column<Intake>[] {
  return [
    {
      id: "grade",
      header: m.itkColGrade(),
      primary: true,
      cell: (row) => <Grade row={row} />,
    },
    {
      id: "dates",
      header: m.itkColDates(),
      cell: (row) => (
        <span className="whitespace-nowrap">
          {m.itkDates({
            from: formatDate(row.opensOn),
            to: formatDate(row.closesOn),
          })}
        </span>
      ),
    },
    {
      id: "places",
      header: m.itkColPlaces(),
      cell: (row) =>
        m.itkPlacesApplying({
          places: formatNumber(row.capacity),
          applying: formatNumber(row.live),
        }),
    },
    {
      id: "drafts",
      header: m.itkColDrafts(),
      cell: (row) => formatNumber(row.drafts),
    },
    {
      id: "window",
      header: m.itkColWindow(),
      cell: (row) => {
        const window = intakeWindow(row, today);
        return (
          <StatusText tone={WINDOW_TONE[window]}>
            {WINDOW_LABEL[window]()}
          </StatusText>
        );
      },
    },
  ];
}

function formColumns(): Column<Form>[] {
  return [
    {
      id: "name",
      header: m.afmColName(),
      primary: true,
      cell: (row) => (
        <RowLink
          to="/admissions/form-editor"
          search={{ id: row.id }}
          className="justify-self-start"
        >
          {named(row.nameEn, row.nameAr)}
        </RowLink>
      ),
    },
    {
      id: "questions",
      header: m.afmColQuestions(),
      cell: (row) => formatNumber(formQuestions(row.body).length),
    },
    {
      id: "published",
      header: m.afmColPublished(),
      cell: (row) => <Published row={row} />,
    },
    {
      id: "intakes",
      header: m.afmColIntakes(),
      cell: (row) => formatNumber(row.intakes),
    },
  ];
}

interface PublishedProps {
  row: Form;
}

function Published({ row }: PublishedProps) {
  if (!row.published)
    return <StatusText tone="neutral">{m.afmNeverPublished()}</StatusText>;
  return (
    <span className="grid gap-0.5">
      <span>
        {m.afmVersion({
          number: formatNumber(row.published.number),
          date: formatDate(row.published.at.slice(0, 10)),
        })}
      </span>
      {row.changed ? (
        <StatusText tone="warning">{m.afmUnpublishedChanges()}</StatusText>
      ) : null}
    </span>
  );
}

const intakeCard = (today: string) => ({
  title: (row: Intake) => <Grade row={row} />,
  status: (row: Intake) => <Window row={row} today={today} />,
  fact: (row: Intake) =>
    m.itkPlacesApplying({
      places: formatNumber(row.capacity),
      applying: formatNumber(row.live),
    }),
});

interface WindowProps {
  row: Intake;
  today: string;
}

function Window({ row, today }: WindowProps) {
  const window = intakeWindow(row, today);
  return (
    <StatusText tone={WINDOW_TONE[window]}>{WINDOW_LABEL[window]()}</StatusText>
  );
}

interface FormNameProps {
  row: Form;
}

function FormName({ row }: FormNameProps) {
  return (
    <RowLink
      to="/admissions/form-editor"
      search={{ id: row.id }}
      className="justify-self-start"
    >
      {named(row.nameEn, row.nameAr)}
    </RowLink>
  );
}

const FORM_CARD = {
  title: (row: Form) => <FormName row={row} />,
  status: (row: Form) => <Published row={row} />,
  fact: (row: Form) =>
    m.afmQuestionsCount({
      count: formatNumber(formQuestions(row.body).length),
    }),
};

function IntakesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(intakesQuery(search.year)).data;
  const options = useSuspenseQuery(intakeOptionsQuery).data;
  const forms = useSuspenseQuery(formsQuery).data;
  const missingWords = options.consents.filter(
    (consent) => consent.meaning !== "marketing" && !consent.published,
  );
  return (
    <>
      <PageHeader
        title={m.itkTitle()}
        description={m.itkHint()}
        action={
          data.configures
            ? search.tab === "forms"
              ? {
                  label: m.afmNew(),
                  icon: Plus,
                  link: { to: "/admissions/form-editor", search: {} },
                }
              : {
                  label: m.itkNew(),
                  icon: Plus,
                  link: {
                    to: "/admissions/intake-editor",
                    search: { year: data.yearId ?? undefined },
                  },
                }
            : undefined
        }
      />
      {missingWords.length ? (
        <p
          role="note"
          className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          {m.itkConsentsMissing({
            purposes: formatList(
              missingWords.map((consent) =>
                inLocale(consent.labelEn, consent.labelAr),
              ),
            ),
          })}{" "}
          {options.privacy ? (
            <Link to="/privacy" className="text-primary hover:underline">
              {m.itkConsentsWrite()}
            </Link>
          ) : null}
        </p>
      ) : null}
      <RecordTabs
        label={m.itkViews()}
        tabs={[
          { value: "intakes" as const, label: m.itkTabIntakes() },
          { value: "forms" as const, label: m.itkTabForms() },
        ]}
        value={search.tab}
        onChange={(tab) =>
          void navigate({
            resetScroll: false,
            replace: true,
            search: (previous) => ({ ...previous, tab }),
          })
        }
      >
        {search.tab === "intakes" ? (
          <div className="grid gap-4">
            <IndexToolbar
              facets={[
                {
                  id: "year",
                  label: m.itkFieldYear(),
                  single: true,
                  defaultSelected: [data.yearId ?? ""],
                  selected: [data.yearId ?? ""],
                  options: options.years.map((year) => ({
                    value: year.id,
                    label: inLocale(year.titleEn, year.titleAr),
                  })),
                  onChange: ([year]) =>
                    void navigate({
                      search: (previous) => ({ ...previous, year: year ?? "" }),
                    }),
                },
              ]}
              onReset={() => void navigate({ search: {} })}
            />
            <DataTable
              caption={m.itkCaption()}
              rows={data.intakes}
              columns={intakeColumns(data.today)}
              rowLabel={(row) => inLocale(row.gradeEn, row.gradeAr)}
              card={intakeCard(data.today)}
              empty={{
                icon: CalendarRange,
                title: m.itkEmpty(),
                description: m.itkEmptyBody(),
              }}
            />
          </div>
        ) : (
          <DataTable
            caption={m.afmCaption()}
            rows={forms.forms}
            columns={formColumns()}
            rowLabel={(row) => named(row.nameEn, row.nameAr)}
            card={FORM_CARD}
            empty={{
              icon: FileText,
              title: m.afmEmpty(),
              description: m.afmEmptyBody(),
            }}
          />
        )}
      </RecordTabs>
    </>
  );
}
