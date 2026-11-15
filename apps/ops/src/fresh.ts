import { STEP_UP_MINUTES } from "@faridalms/domain/operators";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { RESUME_KEY, signInAgain, takeAction } from "./actions";

const resumeSchema = v.object({
  name: v.string(),
  payload: v.string(),
  path: v.string(),
});

// A minute's margin, so a sign-in about to lapse is renewed before the
// operator fills the action in rather than after.
const FRESH_SECONDS = STEP_UP_MINUTES * 60 - 60;

/**
 * Starts an action the server lets through only shortly after a sign-in
 * (`requireFreshSignIn`). With `ask`, an older sign-in sends the operator
 * to sign in again before the action opens, so nothing typed is lost. The
 * page opens the action again on the way back, as it does when the server
 * still asks part-way through. The payload names which one, such as a
 * module or an item.
 */
export function useFreshAction(
  name: string,
  open: (payload: string) => void,
  ask = true,
): (payload?: string) => void {
  const { operator } = useRouteContext({ from: "__root__" });
  const resume = useEffectEvent((payload: string) => open(payload));
  useEffect(() => {
    const held = sessionStorage.getItem(RESUME_KEY);
    if (!held) return;
    const parsed = v.safeParse(resumeSchema, JSON.parse(held));
    if (
      !parsed.success ||
      parsed.output.name !== name ||
      parsed.output.path !== window.location.pathname
    )
      return;
    sessionStorage.removeItem(RESUME_KEY);
    takeAction(name, parsed.output.payload);
    toast.info("Signed in again. Carry on where you were.");
    resume(parsed.output.payload);
  }, [name]);
  return (payload = "") => {
    takeAction(name, payload);
    if (
      ask &&
      (!operator || Date.now() / 1000 - operator.authAt > FRESH_SECONDS)
    ) {
      signInAgain();
      return;
    }
    open(payload);
  };
}
