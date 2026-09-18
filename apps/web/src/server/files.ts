import { initiateUploadSchema } from "@faridalms/domain/file";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";

export const initiateUpload = createServerFn({ method: "POST" })
  .inputValidator(initiateUploadSchema)
  .handler(({ data }) => backend().initiateUpload(data));
