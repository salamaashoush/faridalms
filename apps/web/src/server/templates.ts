import {
  librarySchema,
  reviewTemplateSchema,
  saveSectionTemplateSchema,
  saveTemplateSchema,
  templateKindSchema,
  templateRefSchema,
  updateTemplateSchema,
} from "@faridalms/domain/templates";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const listTemplates = createServerFn({ method: "GET" })
  .validator(checked(templateKindSchema))
  .handler(({ data }) => backend().templates.list(data));

export const openTemplate = createServerFn({ method: "GET" })
  .validator(checked(templateRefSchema))
  .handler(({ data }) => backend().templates.open(data));

export const saveTemplate = createServerFn({ method: "POST" })
  .validator(checked(saveTemplateSchema))
  .handler(({ data }) => backend().templates.save(data));

export const saveSectionTemplate = createServerFn({ method: "POST" })
  .validator(checked(saveSectionTemplateSchema))
  .handler(({ data }) => backend().templates.saveSection(data));

export const openSectionTemplate = createServerFn({ method: "GET" })
  .validator(checked(templateRefSchema))
  .handler(({ data }) => backend().templates.openSection(data));

export const removeTemplate = createServerFn({ method: "POST" })
  .validator(checked(templateRefSchema))
  .handler(({ data }) => backend().templates.remove(data));

export const getLibrary = createServerFn({ method: "GET" })
  .validator(checked(librarySchema))
  .handler(({ data }) => record(backend().templates.library(data)));

export const getLibraryQueue = createServerFn({ method: "GET" }).handler(() =>
  record(backend().templates.queue()),
);

export const reviewTemplate = createServerFn({ method: "POST" })
  .validator(checked(reviewTemplateSchema))
  .handler(({ data }) => backend().templates.review(data));

export const updateTemplate = createServerFn({ method: "POST" })
  .validator(checked(updateTemplateSchema))
  .handler(({ data }) => backend().templates.update(data));
