import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));

const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

const optionalText = (max: number) =>
  v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(max),
      v.transform((value) => (value === "" ? null : value)),
    ),
    "",
  );

/** The places in the order of calling, shared with what a module marks. */
export const CALL_ORDER_MIN = 1;
export const CALL_ORDER_MAX = 99;

/**
 * Someone a person has the school call if something happens: their name,
 * a phone, another phone or an email, who they are to the person in the
 * person's own words, where they stand in the order of calling, and notes.
 */
export const saveEmergencyContactSchema = v.object({
  personId: id,
  id: v.optional(id),
  expectedVersion: v.optional(version),
  name: text(160),
  relationship: optionalText(80),
  phone: text(40),
  otherPhone: optionalText(40),
  email: v.optional(
    v.union([
      v.literal(""),
      v.pipe(
        v.string(),
        v.trim(),
        v.toLowerCase(),
        v.maxLength(254),
        v.email(),
      ),
    ]),
    "",
  ),
  callOrder: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(CALL_ORDER_MIN),
    v.maxValue(CALL_ORDER_MAX),
  ),
  notes: optionalText(500),
});
export type SaveEmergencyContactInput = v.InferInput<
  typeof saveEmergencyContactSchema
>;

export const removeEmergencyContactSchema = v.object({
  personId: id,
  id,
  expectedVersion: version,
});

/**
 * One list in the order the school calls: by place in the order, those
 * without one at the last place, and the contacts a module marks before the person's
 * own at the same place, as they were the only ones the school called
 * before the person had any. Otherwise each keeps the order it came in.
 */
export function inCallingOrder<
  T extends { order: number | null; own: boolean },
>(contacts: readonly T[]): T[] {
  return contacts.toSorted(
    (a, b) =>
      (a.order ?? CALL_ORDER_MAX) - (b.order ?? CALL_ORDER_MAX) ||
      Number(a.own) - Number(b.own),
  );
}
