import { pictureSearchSchema } from "@faridalms/domain/pictures";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const searchPictures = createServerFn({ method: "GET" })
  .validator(checked(pictureSearchSchema))
  .handler(({ data }) => backend().pictures.search(data));
