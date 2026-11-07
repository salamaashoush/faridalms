import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../button";
import { useSystemStrings } from "./provider";

export interface CopyButtonProps {
  value: string;
  /** Names what is copied for a screen reader, such as "Copy TXT value". */
  label: string;
}

/** Copies a value to the clipboard and says so for two seconds. */
export function CopyButton({ value, label }: CopyButtonProps) {
  const strings = useSystemStrings();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="max-md:size-10"
      aria-label={copied ? strings.copied : label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}
