import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * Leaves for `to` after the session changed hands (sign-in, sign-out, a
 * device handed to a child and back), with nothing of the previous session
 * left in the query or route caches.
 */
export function useSessionChange() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async (
      to: "/" | "/sign-in" | { href: string },
      { replace = false } = {},
    ) => {
      queryClient.clear();
      // Not `invalidate()`: it reloads the page being left, whose own guard
      // then redirects, so every change of session loaded twice and the
      // address passed through the home page and back.
      router.clearCache();
      await (typeof to === "string"
        ? router.navigate({ to, replace })
        : router.navigate({ href: to.href, replace }));
    },
    [router, queryClient],
  );
}
