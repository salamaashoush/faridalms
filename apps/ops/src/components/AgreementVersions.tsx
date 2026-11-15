import type { Agreement } from "@faridalms/domain/agreements";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { AGREEMENTS } from "@faridalms/domain/agreements";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { AGREEMENT_LABELS, formatDay, formatWhen } from "../format";
import { publishAgreement } from "../server/agreements";
import { WhyField } from "./Why";

/** A published version as the settings page lists it. */
export interface AgreementVersionRow {
  id: string;
  kind: Agreement;
  version: string;
  effectiveOn: string;
  publishedAt: Date;
  publishedBy: string;
}

type Standing = "in_force" | "later" | "replaced";

interface Row extends AgreementVersionRow {
  standing: Standing;
  publisher: string;
}

const STANDING_NAMES: Record<Standing, string> = {
  in_force: "In force",
  later: "Takes effect later",
  replaced: "Replaced",
};

const legalPath = (row: { kind: Agreement; version: string }) =>
  `/legal/${row.kind}/${encodeURIComponent(row.version)}`;

const COLUMNS: Column<Row>[] = [
  {
    id: "agreement",
    header: "Agreement",
    primary: true,
    cell: (row) => (
      <span className="grid min-w-0 py-2.5">
        <a
          href={legalPath(row)}
          target="_blank"
          rel="noreferrer"
          className="truncate font-medium text-foreground underline-offset-4 hover:underline"
        >
          {AGREEMENT_LABELS[row.kind]}, version{" "}
          <span dir="ltr">{row.version}</span>
        </a>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          Published {formatWhen(row.publishedAt)} by {row.publisher}
        </span>
      </span>
    ),
  },
  {
    id: "from",
    header: "From",
    cell: (row) => formatDay(row.effectiveOn),
  },
  {
    id: "standing",
    header: "Status",
    cell: (row) => (
      <StatusBadge
        tone={
          row.standing === "in_force"
            ? "success"
            : row.standing === "later"
              ? "info"
              : "neutral"
        }
      >
        {STANDING_NAMES[row.standing]}
      </StatusBadge>
    ),
  },
];

const CARD: DataTableCard<Row> = {
  title: (row) => `${AGREEMENT_LABELS[row.kind]}, version ${row.version}`,
  status: (row) => STANDING_NAMES[row.standing],
  fact: (row) => `From ${formatDay(row.effectiveOn)}`,
};

export interface AgreementVersionsProps {
  versions: readonly AgreementVersionRow[];
  /** The ids of the versions in force today. */
  inForce: readonly string[];
  today: string;
  names: Readonly<Record<string, string>>;
}

/**
 * The terms of service and the data processing agreement as published,
 * each version written once: what every customer's link shows and what
 * each acceptance proves.
 */
export function AgreementVersions({
  versions,
  inForce,
  today,
  names,
}: AgreementVersionsProps) {
  const publishing = useSheet();
  const rows: Row[] = versions.map((row) => ({
    ...row,
    publisher: names[row.publishedBy] ?? "An operator",
    standing: inForce.includes(row.id)
      ? "in_force"
      : row.effectiveOn > today
        ? "later"
        : "replaced",
  }));
  const publish = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="max-md:h-10"
      onClick={publishing.show}
    >
      <Plus aria-hidden />
      Publish a version
    </Button>
  );
  return (
    <SettingsSection
      title="Agreements"
      description="What customers read and accept, through the link they are sent with a quote or from their record. A version is never changed once published: a change is a new version, which customers are asked to accept."
    >
      <DataTable
        caption="Agreements"
        rows={rows}
        columns={COLUMNS}
        rowLabel={(row) =>
          `${AGREEMENT_LABELS[row.kind]}, version ${row.version}`
        }
        card={CARD}
        actions={publish}
        empty={{
          icon: FileSignature,
          title: "Publish the terms and the data processing agreement",
          description:
            "Until both are published no quote can be sent for acceptance and no customer asked to accept them.",
          action: publish,
        }}
      />
      <PublishAgreementSheet
        key={publishing.key}
        open={publishing.open}
        onOpenChange={publishing.onOpenChange}
        today={today}
      />
    </SettingsSection>
  );
}

interface PublishAgreementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}

function PublishAgreementSheet({
  open,
  onOpenChange,
  today,
}: PublishAgreementSheetProps) {
  const router = useRouter();
  const publish = useServerFn(publishAgreement);
  const [kind, setKind] = useState<Agreement>("terms");
  const [version, setVersion] = useState(today.slice(0, 7));
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [bodyEn, setBodyEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Publish a version"
      submitLabel="Publish"
      size="wide"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!version.trim() || !bodyEn.trim() || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            publish({
              data: {
                kind,
                version: version.trim(),
                effectiveOn,
                bodyEn,
                bodyAr: bodyAr.trim() || null,
                reason: reason.trim(),
              },
            }),
          "The version could not be published.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success(`${AGREEMENT_LABELS[kind]} ${version.trim()} published.`);
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        Published, it is public at its own address and never changes. Customers
        asked to accept from its day see it.
      </p>
      <div className="grid items-start gap-6 @md:grid-cols-3">
        <SelectField
          label="Agreement"
          value={kind}
          options={AGREEMENTS.map((value) => ({
            value,
            label: AGREEMENT_LABELS[value],
          }))}
          onChange={setKind}
        />
        <TextField
          label="Version"
          dir="ltr"
          maxLength={40}
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          errors={
            submitted && !version.trim() ? ["Name the version."] : undefined
          }
        />
        <TextField
          label="Takes effect"
          type="date"
          value={effectiveOn}
          onChange={(event) => setEffectiveOn(event.target.value)}
        />
      </div>
      <FormField
        label="Words in English"
        hint="Markdown: # for headings, - for lists, [words](address) for links."
        errors={
          submitted && !bodyEn.trim()
            ? ["Give the words in English."]
            : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            rows={14}
            value={bodyEn}
            onChange={(event) => setBodyEn(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="Words in Arabic" optional>
        {(control) => (
          <Textarea
            {...control}
            dir="rtl"
            lang="ar"
            rows={10}
            value={bodyAr}
            onChange={(event) => setBodyAr(event.target.value)}
          />
        )}
      </FormField>
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SheetForm>
  );
}
