import { saveSchoolSchema, setFeatureSchema } from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getSchoolProfile = createServerFn({ method: "GET" }).handler(() =>
  backend().school.profile(),
);

export const saveSchoolProfile = createServerFn({ method: "POST" })
  .validator(checked(saveSchoolSchema))
  .handler(({ data }) => backend().school.saveProfile(data));

export const getSchoolFeatures = createServerFn({ method: "GET" }).handler(() =>
  backend().school.features(),
);

export const setSchoolFeature = createServerFn({ method: "POST" })
  .validator(checked(setFeatureSchema))
  .handler(({ data }) => backend().school.setFeature(data));
