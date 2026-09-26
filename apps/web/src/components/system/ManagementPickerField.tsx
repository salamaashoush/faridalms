import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";
import type { ComponentProps, ReactNode } from "react";

import {
  QueryErrorResetBoundary,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Component, Suspense, useDeferredValue, useState } from "react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import * as m from "~/i18n/messages";
import { managementOptionsQuery } from "~/queries/school";
import { getMessageFromError } from "~/utils/error";

import { ComboboxField } from "./ComboboxField";
import { widths } from "./field";

export interface ManagementPickerProps {
  kind: ManagementOptionsInput["kind"];
  studentId?: string;
  label: string;
  hint?: ReactNode;
  searchLabel: string;
  emptyLabel: string;
  value: string[];
  onChange: (value: string[], labels: string[]) => void;
  optional?: boolean;
  clearable?: boolean;
  multiple?: boolean;
  exclude?: string;
  errors?: ComponentProps<typeof ComboboxField>["errors"];
}

function Fallback({ label }: { label: string }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm leading-5 font-medium">{label}</span>
      <Skeleton className="h-9 w-full max-md:h-10" />
    </div>
  );
}

/**
 * Every search asks the server again, so a picker can fail after the form
 * has opened. It then offers Retry in its own place, and the rest of the form
 * keeps what was typed rather than the route's error page replacing it.
 */
class PickerBoundary extends Component<
  { label: string; onRetry: () => void; children: ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid justify-items-start gap-2">
        <span className="text-sm leading-5 font-medium">
          {this.props.label}
        </span>
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {getMessageFromError(this.state.error)}
        </p>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => {
            this.props.onRetry();
            this.setState({ error: null });
          }}
        >
          {m.docRetry()}
        </Button>
      </div>
    );
  }
}

function Picker({
  kind,
  studentId,
  exclude,
  onChange,
  ...field
}: ManagementPickerProps) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const selectedIds = useDeferredValue(field.value);
  const { data } = useSuspenseQuery(
    managementOptionsQuery({ kind, q, selectedIds, studentId }),
  );
  const options = data
    .filter((row) => row.id !== exclude)
    .map((row) => ({ value: row.id, label: row.name }));
  return (
    <ComboboxField
      {...field}
      options={options}
      onChange={(next) =>
        onChange(
          next,
          next.map(
            (id) => options.find((option) => option.value === id)?.label ?? "",
          ),
        )
      }
      search={search}
      onSearchChange={setSearch}
    />
  );
}

export function ManagementPickerField({
  width = "name",
  ...props
}: ManagementPickerProps & { width?: keyof typeof widths }) {
  return (
    <div className={widths[width]}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <PickerBoundary label={props.label} onRetry={reset}>
            <Suspense fallback={<Fallback label={props.label} />}>
              <Picker {...props} />
            </Suspense>
          </PickerBoundary>
        )}
      </QueryErrorResetBoundary>
    </div>
  );
}
