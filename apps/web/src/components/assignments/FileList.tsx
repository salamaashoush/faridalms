import type { FileSummary } from "@faridalms/database/repositories/files";

import { Download, Paperclip, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return m.fileSizeBytes({ count: formatNumber(bytes) });
  if (bytes < 1024 * 1024)
    return m.fileSizeKilobytes({
      count: formatNumber(Math.round(bytes / 1024)),
    });
  return m.fileSizeMegabytes({
    count: formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10),
  });
}

/** Downloads go through the web's file route, which forwards the session to the API. */
export function FileList({
  files,
  onRemove,
  disabled = false,
  emptyLabel,
}: {
  files: FileSummary[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  if (files.length === 0)
    return emptyLabel ? (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    ) : null;
  return (
    <ul className="divide-y rounded-lg border bg-background">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-3 px-3 py-2">
          <Paperclip
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <a
            href={`/files/${file.id}`}
            download={file.name}
            className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          >
            {file.name}
          </a>
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {fileSizeLabel(file.sizeBytes)}
          </span>
          <a
            href={`/files/${file.id}`}
            download={file.name}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={m.fileDownloadNamed({ name: file.name })}
          >
            <Download className="size-4" aria-hidden />
          </a>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={m.fileRemoveNamed({ name: file.name })}
              onClick={() => onRemove(file.id)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
