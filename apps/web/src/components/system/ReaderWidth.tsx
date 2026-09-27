import { FoldHorizontal, UnfoldHorizontal } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import * as m from "~/i18n/messages";

const KEY = "reader-width";
const CHANGE = "reader-width-change";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE, notify);
  };
}

/**
 * Whether documents read across the whole page instead of the 720px column,
 * a choice kept on this device for every document. The server draws the
 * column, and the page widens once it has hydrated.
 */
export function useReaderWidth() {
  const wide = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) === "wide",
    () => false,
  );
  const toggle = () => {
    localStorage.setItem(KEY, wide ? "column" : "wide");
    window.dispatchEvent(new Event(CHANGE));
  };
  return { wide, toggle };
}

export function ReaderWidthToggle({
  wide,
  onToggle,
}: {
  wide: boolean;
  onToggle: () => void;
}) {
  const Icon = wide ? FoldHorizontal : UnfoldHorizontal;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m.docFullWidth()}
            aria-pressed={wide}
            className="max-lg:hidden"
            onClick={onToggle}
          />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{m.docFullWidth()}</TooltipContent>
    </Tooltip>
  );
}
