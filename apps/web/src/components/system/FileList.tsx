import type { FileSummary } from "@faridalms/domain/file";
import type { ComponentProps } from "react";

import { useFileFacts } from "@faridalms/editor/file-facts";
import { FileCard } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { X } from "lucide-react";

import { fileStrings } from "~/components/content/strings";
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

interface ListedFileProps extends Omit<
  ComponentProps<typeof FileCard>,
  "file" | "url"
> {
  file: FileSummary;
}

/** A file's card, with what its previews add once they are known. */
function ListedFile({ file, ...card }: ListedFileProps) {
  const facts = useFileFacts(file.id, {
    name: file.name,
    mime: file.mediaType,
    bytes: file.sizeBytes,
  });
  return <FileCard file={facts} url={`/files/${file.id}`} {...card} />;
}

export interface FileListProps {
  files: FileSummary[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
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
}: FileListProps) {
  if (files.length === 0)
    return emptyLabel ? (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    ) : null;
  const strings = fileStrings();
  return (
    <ul className="grid gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <ListedFile
            file={file}
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
