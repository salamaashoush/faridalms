import { commonsSwitchSchema } from "@faridalms/domain/library";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { saveSchoolSchema, setFeatureSchema } from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

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

export const getSchoolStorage = createServerFn({ method: "GET" }).handler(() =>
  backend().school.storage(),
);

export const getPictureSources = createServerFn({ method: "GET" }).handler(() =>
  backend().school.pictureSources(),
);

export const setCommonsPictures = createServerFn({ method: "POST" })
  .validator(checked(commonsSwitchSchema))
  .handler(({ data }) => backend().school.setCommonsPictures(data));

const askSchema = v.object({ module: v.picklist(MODULE_IDS) });

/** Asks the platform about a module the school's plan does not have. */
export const askAboutModule = createServerFn({ method: "POST" })
  .validator(checked(askSchema))
  .handler(({ data }) => backend().school.askAboutModule(data));
