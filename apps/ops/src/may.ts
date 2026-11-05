import type { OperatorArea } from "@faridalms/domain/operators";

import { mayOperate } from "@faridalms/domain/operators";
import { useRouteContext } from "@tanstack/react-router";

/** Whether the signed-in operator's roles cover a part of the console. */
export function useMay(area: OperatorArea): boolean {
  const { access } = useRouteContext({ from: "__root__" });
  return mayOperate(access?.roles ?? [], area);
}
