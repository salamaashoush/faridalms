import type { PartValue } from "@faridalms/domain/classes";
import type { RolloverClass } from "@faridalms/domain/rollover";
import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

/** How a module that carries classes over a rollover names what it carries. */
export interface RolloverCarrierWords {
  /** The carrier's key, as the plan's rows name it. */
  carrier: string;
  /** What goes over with a row, under its fields. */
  describe(row: RolloverClass): string;
  /** How the class's primary teacher is named. */
  teacher: () => string;
}

export const rolloverCarrierWords = slot<RolloverCarrierWords>(
  "rollover carrier words",
);

export interface RolloverPartFieldProps {
  /** The plan's row, which names the field by its key. */
  rowKey: string;
  value: PartValue | undefined;
  onChange: (value: PartValue) => void;
}

/**
 * A field a module adds to each class a rollover carries, under the key the
 * plan's rows keep its value by: the grade the carried class teaches, say.
 */
export interface RolloverClassPart {
  key: string;
  /** What the field reads, loaded with the rollover. */
  query(): SlotQuery<unknown>;
  Field: ComponentType<RolloverPartFieldProps>;
}

export const rolloverClassParts = slot<RolloverClassPart>(
  "rollover class parts",
);

/**
 * Present where a module answers for learners, so a rollover may ask them
 * whether each learner returns next year: families, say.
 */
export const reenrolmentAnswerers = slot<true>("reenrolment answerers");
