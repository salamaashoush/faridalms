import type { FilePurpose, FileSummary } from "@faridalms/domain/file";

import { ACCEPTED_EXTENSIONS, mediaTypeFor } from "@faridalms/domain/file";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { initiateUpload } from "~/server/files";
import { getMessageFromError } from "~/utils/error";

import { FormField } from "./field";
import { FileList, fileSizeLabel } from "./FileList";

interface Pending {
  key: string;
  name: string;
  error: string | null;
}

/**
 * Files attached to a form: each is declared, then streamed through the
 * web's file route, and counts only once the API has verified what arrived.
 */
export function FileField({
  id,
  label,
  hint,
  purpose,
  value,
  onChange,
  maxFiles,
  maxBytes,
  optional,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string;
  purpose: FilePurpose;
  value: FileSummary[];
  onChange: (update: (current: FileSummary[]) => FileSummary[]) => void;
  maxFiles: number;
  maxBytes: number;
  optional?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const initiate = useServerFn(initiateUpload);
  const [pending, setPending] = useState<Pending[]>([]);
  const uploading = pending.filter((row) => !row.error).length;
  const full = value.length + uploading >= maxFiles;

  const upload = async (file: File) => {
    const key = crypto.randomUUID();
    const fail = (error: string) =>
      setPending((rows) =>
        rows.map((row) => (row.key === key ? { ...row, error } : row)),
      );
    setPending((rows) => [...rows, { key, name: file.name, error: null }]);
    if (file.size > maxBytes) {
      fail(m.fileTooLargeFor({ max: fileSizeLabel(maxBytes) }));
      return;
    }
    try {
      const initiated = await initiate({
        data: {
          purpose,
          name: file.name,
          mediaType: file.type || mediaTypeFor(file.name) || "",
          sizeBytes: file.size,
        },
      });
      const response = await fetch(`/files/${initiated.id}`, {
        method: "PUT",
        headers: { "content-type": initiated.mediaType },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        throw new Error(body?.code ?? m.fileUploadFailed());
      }
      onChange((current) => [
        ...current,
        {
          id: initiated.id,
          name: initiated.name,
          mediaType: initiated.mediaType,
          sizeBytes: initiated.sizeBytes,
        },
      ]);
      setPending((rows) => rows.filter((row) => row.key !== key));
    } catch (error) {
      fail(getMessageFromError(error));
    }
  };

  return (
    <FormField id={id} label={label} hint={hint} optional={optional}>
      {(control) => (
        <div className="grid gap-2">
          <FileList
            files={value}
            disabled={disabled}
            onRemove={(fileId) =>
              onChange((current) =>
                current.filter((file) => file.id !== fileId),
              )
            }
          />
          {pending.length ? (
            <ul className="grid gap-1" aria-live="polite">
              {pending.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  {row.error ? (
                    <span className="min-w-0 flex-1 text-destructive">
                      {row.name}: {row.error}
                    </span>
                  ) : (
                    <>
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden
                      />
                      <span>{m.fileUploading({ name: row.name })}</span>
                    </>
                  )}
                  {row.error ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.fileDismissNamed({ name: row.name })}
                      onClick={() =>
                        setPending((rows) =>
                          rows.filter((item) => item.key !== row.key),
                        )
                      }
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <input
            ref={input}
            id={control.id}
            aria-describedby={control["aria-describedby"]}
            type="file"
            className="sr-only"
            multiple={maxFiles > 1}
            accept={ACCEPTED_EXTENSIONS.map(
              (extension) => `.${extension}`,
            ).join(",")}
            disabled={disabled || full}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              const room = maxFiles - value.length - uploading;
              for (const file of files.slice(0, Math.max(0, room)))
                void upload(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={disabled || full}
              onClick={() => input.current?.click()}
            >
              <Upload aria-hidden />
              {m.fileChoose()}
            </Button>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {m.fileLimits({ count: maxFiles, size: fileSizeLabel(maxBytes) })}
            </span>
          </div>
        </div>
      )}
    </FormField>
  );
}
