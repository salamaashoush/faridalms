import {
  cancelEventSchema,
  eventRefSchema,
  rangeQuerySchema,
  saveEventSchema,
} from "@faridalms/domain/calendar";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getCalendarRange = createServerFn({ method: "GET" })
  .validator(checked(rangeQuerySchema))
  .handler(({ data }) => backend().calendar.range(data));

export const getCalendarOptions = createServerFn({ method: "GET" }).handler(
  () => backend().calendar.options(),
);

export const getCalendarEvent = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().calendar.event(data)));

export const saveCalendarEvent = createServerFn({ method: "POST" })
  .validator(checked(saveEventSchema))
  .handler(({ data }) => backend().calendar.save(data));

export const cancelCalendarEvent = createServerFn({ method: "POST" })
  .validator(checked(cancelEventSchema))
  .handler(({ data }) => backend().calendar.cancel(data));

export const removeCalendarEvent = createServerFn({ method: "POST" })
  .validator(checked(eventRefSchema))
  .handler(({ data }) => backend().calendar.remove(data));
