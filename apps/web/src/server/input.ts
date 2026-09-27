import * as v from "valibot";

/**
 * Checks the input here for a fast refusal and forwards it as typed: the API
 * parses it again, and some fields only take their final form there.
 */
export function checked<S extends v.GenericSchema>(schema: S) {
  return (input: v.InferInput<S>) => {
    v.parse(schema, input);
    return input;
  };
}

export const byId = (input: unknown) =>
  v.parse(v.object({ id: v.pipe(v.string(), v.uuid()) }), input);
