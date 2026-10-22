import type { Digits } from "@faridalms/domain/people";

import { createContext } from "react";

/** The digits the school writes Arabic in, for formulas in Arabic notation. */
export const MathDigits = createContext<Digits>("latn");
