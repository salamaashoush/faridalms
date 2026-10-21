import {
  bankQuerySchema,
  bankRefSchema,
  saveBankQuestionSchema,
} from "@faridalms/domain/bank";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const listBank = createServerFn({ method: "GET" })
  .validator(checked(bankQuerySchema))
  .handler(({ data }) => backend().bank.list(data));

export const bankTags = createServerFn({ method: "GET" }).handler(() =>
  backend().bank.tags(),
);

export const openBankQuestion = createServerFn({ method: "GET" })
  .validator(checked(bankRefSchema))
  .handler(({ data }) => backend().bank.open(data));

export const saveBankQuestion = createServerFn({ method: "POST" })
  .validator(checked(saveBankQuestionSchema))
  .handler(({ data }) => backend().bank.save(data));

export const removeBankQuestion = createServerFn({ method: "POST" })
  .validator(checked(bankRefSchema))
  .handler(({ data }) => backend().bank.remove(data));
