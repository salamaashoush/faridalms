import type { FilePurpose, FileSummary } from "@faridalms/domain/file";

import { ACCEPTED_EXTENSIONS, mediaTypeFor } from "@faridalms/domain/file";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Field, FieldDescription, FieldLabel } from "~/components/app/field";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { initiateUpload } from "~/server/files";
import { getMessageFromError } from "~/utils/error";

import { FileList, fileSizeLabel } from "./FileList";

interface Pending {
  key: string;
  name: string;
  error: string | null;
}

/**
 * Two steps, both authorised by the API: declare the file and receive a
 * destination, then stream the bytes through the web's file route. The file
 * only counts once the API has verified what arrived.
 */
export function FileUploader({
  label,
  description,
  purpose,
  value,
  onChange,
  maxFiles,
  maxBytes,
  disabled = false,
}: {
  label: string;
  description?: string;
  purpose: FilePurpose;
  value: FileSummary[];
  onChange: (update: (current: FileSummary[]) => FileSummary[]) => void;
  maxFiles: number;
  maxBytes: number;
  disabled?: boolean;
}) {
  const id = useId();
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
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FileList
        files={value}
        disabled={disabled}
        onRemove={(fileId) =>
          onChange((current) => current.filter((file) => file.id !== fileId))
        }
      />
      {pending.length ? (
        <ul className="space-y-1">
          {pending.map((row) => (
            <li
              key={row.key}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              aria-live="polite"
            >
              {row.error ? (
                <span className="text-destructive">
                  {row.name}: {row.error}
                </span>
              ) : (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  <span>{m.fileUploading({ name: row.name })}</span>
                </>
              )}
              {row.error ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ms-auto"
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
        id={id}
        type="file"
        className="sr-only"
        multiple={maxFiles > 1}
        accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(
          ",",
        )}
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
          disabled={disabled || full}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          {m.fileChoose()}
        </Button>
        <span className="text-xs text-muted-foreground">
          {m.fileLimits({ count: maxFiles, size: fileSizeLabel(maxBytes) })}
        </span>
      </div>
    </Field>
  );
}
