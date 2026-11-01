/**
 * The variables that are set to something. Compose passes `${NAME:-}` for an
 * optional variable as an empty string, which a schema would read as a value
 * and refuse, where the operator meant it unset.
 */
export function presentVariables(
  variables: Record<string, string | undefined>,
): Record<string, string> {
  const present: Record<string, string> = {};
  for (const [name, value] of Object.entries(variables))
    if (value !== undefined && value !== "") present[name] = value;
  return present;
}
