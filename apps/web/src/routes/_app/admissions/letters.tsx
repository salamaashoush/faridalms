import type { LetterKind } from "@faridalms/domain/admissions";
import type { Column } from "@faridalms/ui/system/data-table";

import { LETTER_KINDS, letterKey } from "@faridalms/domain/admissions";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { LETTER_LABEL } from "~/components/admissions/application-labels";
import * as m from "~/i18n/messages";
import { lettersQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { formatDate } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admissions/letters")({
  staticData: { breadcrumb: m.ltrTitle },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:configure");
    await context.queryClient.ensureQueryData(lettersQuery);
  },
  component: LettersPage,
});

const LETTER_HINT: Record<LetterKind, () => string> = {
  offer: m.ltrOfferHint,
  waitlist: m.ltrWaitlistHint,
  decline: m.ltrDeclineHint,
  welcome: m.ltrWelcomeHint,
};

interface Row {
  id: string;
  kind: LetterKind;
  locale: "en" | "ar";
  title: string;
  updatedAt: string;
}

const LANGUAGE = { en: m.admLanguageEn, ar: m.admLanguageAr };

interface TitleProps {
  row: Row;
}

function Title({ row }: TitleProps) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <RowLink
        to="/admissions/letter-editor"
        search={{ id: row.id }}
        className="justify-self-start"
      >
        <bdi dir={row.locale === "ar" ? "rtl" : "ltr"}>{row.title}</bdi>
      </RowLink>
      <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
        {LETTER_HINT[row.kind]()}
      </span>
    </span>
  );
}

const COLUMNS: Column<Row>[] = [
  {
    id: "title",
    header: m.ltrColLetter(),
    primary: true,
    cell: (row) => <Title row={row} />,
  },
  {
    id: "phase",
    header: m.ltrColPhase(),
    cell: (row) => LETTER_LABEL[row.kind](),
  },
  {
    id: "language",
    header: m.admFieldLanguage(),
    cell: (row) => LANGUAGE[row.locale](),
  },
  {
    id: "updated",
    header: m.ltrColUpdated(),
    cell: (row) => formatDate(row.updatedAt.slice(0, 10)),
  },
];

const CARD = {
  title: (row: Row) => <Title row={row} />,
  status: (row: Row) => LANGUAGE[row.locale](),
  fact: (row: Row) => LETTER_LABEL[row.kind](),
};

/**
 * The letters admissions sends, one for each phase in each language: the
 * school's own templates, which every family's letter is written from.
 */
function LettersPage() {
  const templates = useSuspenseQuery(lettersQuery).data;
  const rows: Row[] = LETTER_KINDS.flatMap((kind) =>
    (["en", "ar"] as const).flatMap((locale) => {
      const found = templates.find(
        (template) => template.builtinKey === letterKey(kind, locale),
      );
      return found
        ? [
            {
              id: found.id,
              kind,
              locale,
              title: found.title,
              updatedAt: found.updatedAt,
            },
          ]
        : [];
    }),
  );
  return (
    <>
      <PageHeader title={m.ltrTitle()} description={m.ltrHint()} />
      <DataTable
        caption={m.ltrCaption()}
        rows={rows}
        columns={COLUMNS}
        rowLabel={(row) => row.title}
        card={CARD}
        empty={{ icon: Mail, title: m.ltrEmpty() }}
      />
    </>
  );
}
