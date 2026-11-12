import type { ReportingSpan } from "@faridalms/domain/spans";

import { addDays } from "@faridalms/domain/school";
import { defaultReportingSpan, rangeFits } from "@faridalms/domain/spans";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { contributionsTo, point } from "./extension";

/**
 * The spans a school reports over, such as a school year and its terms. On
 * a day, the first a module gives is the one holding it.
 */
export interface ReportingSpans {
  spansOn(context: UnitContext, day: string): Promise<ReportingSpan[]>;
}

export const reportingSpans = point<ReportingSpans>("reporting spans");

/** Every span the modules on give for a day, the one holding it first. */
export async function spansOn(
  context: UnitContext,
  day: string,
): Promise<ReportingSpan[]> {
  const found = await Promise.all(
    (await contributionsTo(context, reportingSpans)).map((contribution) =>
      contribution.spansOn(context, day),
    ),
  );
  return found.flat();
}

/** The days a report covers by default on a day: the first span given, else the last weeks. */
export async function defaultSpan(
  context: UnitContext,
  day: string,
): Promise<{ from: string; endsBefore: string }> {
  const [first] = await spansOn(context, day);
  return first
    ? { from: first.from, endsBefore: first.endsBefore }
    : defaultReportingSpan(day);
}

/**
 * The days a report asked for covers, up to `today`: a span by key, a
 * chosen range, or the default span. A key no module gives is not found.
 */
export async function reportRange(
  context: UnitContext,
  input: { span: string; from: string; to: string },
): Promise<{
  span: string;
  from: string;
  to: string;
  spans: ReportingSpan[];
}> {
  const spans = await spansOn(context, context.today);
  const capped = (last: string) =>
    last < context.today ? last : context.today;
  if (input.span) {
    const span = spans.find((row) => row.key === input.span);
    if (!span) throw new ORPCError("NOT_FOUND");
    return {
      span: span.key,
      from: span.from,
      to: capped(addDays(span.endsBefore, -1)),
      spans,
    };
  }
  if (input.from || input.to) {
    const from = input.from || input.to;
    const to = input.to || context.today;
    if (!rangeFits(from, to))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.range" });
    return { span: "", from, to, spans };
  }
  const first = spans[0];
  const span = first ?? {
    key: "",
    ...defaultReportingSpan(context.today),
  };
  return {
    span: first?.key ?? "",
    from: span.from,
    to: capped(addDays(span.endsBefore, -1)),
    spans,
  };
}
