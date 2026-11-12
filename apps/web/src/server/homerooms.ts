import {
  homeroomDirectorySchema,
  leaveHomeroomSchema,
  ofClassSchema,
  placeSchema,
  saveHomeroomSchema,
} from "@faridalms/domain/homerooms";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getHomeroomDirectory = createServerFn({ method: "GET" })
  .validator(checked(homeroomDirectorySchema))
  .handler(({ data }) => record(backend().homerooms.directory(data)));

export const getHomeroomOfClass = createServerFn({ method: "GET" })
  .validator(checked(ofClassSchema))
  .handler(({ data }) => record(backend().homerooms.ofClass(data)));

export const getHomeroomHistory = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().homerooms.history(data)));

export const getUnstaffedHomerooms = createServerFn({ method: "GET" }).handler(
  () => backend().homerooms.unstaffed(),
);

export const saveHomeroom = createServerFn({ method: "POST" })
  .validator(checked(saveHomeroomSchema))
  .handler(({ data }) => backend().homerooms.save(data));

export const placeInHomeroom = createServerFn({ method: "POST" })
  .validator(checked(placeSchema))
  .handler(({ data }) => backend().homerooms.place(data));

export const leaveHomeroom = createServerFn({ method: "POST" })
  .validator(checked(leaveHomeroomSchema))
  .handler(({ data }) => backend().homerooms.leave(data));
