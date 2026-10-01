import type { FileSummary } from "@faridalms/domain/file";

import { FileCard } from "@faridalms/editor/files";
import { X } from "lucide-react";

import { fileStrings } from "~/components/content/strings";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return m.fileSizeBytes({ count: formatNumber(bytes) });
  if (bytes < 1024 * 1024)
    return m.fileSizeKilobytes({
      count: formatNumber(Math.round(bytes / 1024)),
    });
  if (bytes < 1024 * 1024 * 1024)
    return m.fileSizeMegabytes({
      count: formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10),
    });
  return m.fileSizeGigabytes({
    count: formatNumber(Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10),
  });
}

/**
 * Files outside a document, such as work handed in or a message's
 * attachments, shown as the same cards and viewer a document uses. The web's
 * file route forwards the session, so only people allowed to read open them.
 */
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
  const strings = fileStrings();
  return (
    <ul className="grid gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <FileCard
            file={{
              name: file.name,
              mime: file.mediaType,
              bytes: file.sizeBytes,
            }}
            url={`/files/${file.id}`}
            strings={strings}
            locale={getLocale()}
            actions={
              onRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  disabled={disabled}
                  aria-label={m.fileRemoveNamed({ name: file.name })}
                  onClick={() => onRemove(file.id)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}
