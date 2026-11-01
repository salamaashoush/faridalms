import type { Capability } from "@faridalms/domain/capabilities";
import type { Workspace } from "@faridalms/domain/workspace";

import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { redirect } from "@tanstack/react-router";

/**
 * Opens a page only to someone holding one of the capabilities and sends
 * anyone else to their own home, as the workspace prefixes do. The server
 * still authorises the data; without this a page for someone else opens
 * onto the error its first request raises.
 */
export function requirePage(
  user: { capabilities: readonly Capability[]; workspace: Workspace },
  ...capabilities: readonly Capability[]
): void {
  if (
    !capabilities.some((capability) => user.capabilities.includes(capability))
  )
    throw redirect({ to: WORKSPACE_HOME[user.workspace] });
}
