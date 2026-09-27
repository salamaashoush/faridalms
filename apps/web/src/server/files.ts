import { initiateUploadSchema } from "@faridalms/domain/file";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const initiateUpload = createServerFn({ method: "POST" })
  .validator(checked(initiateUploadSchema))
  .handler(({ data }) => backend().files.initiate(data));
