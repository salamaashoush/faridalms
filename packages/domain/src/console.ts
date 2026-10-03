function bracketed(items: string[], open: string, close: string): string {
  return items.length
    ? `${open} ${items.join(", ")} ${close}`
    : `${open}${close}`;
}

/**
 * A value as a JavaScript console shows it: text as it is, everything else
 * in the shape a reader would type it. A student's program prints the same
 * when they run it in the browser and when its tests mark it.
 */
export function consoleText(value: unknown, depth = 0): string {
  if (typeof value === "string")
    return depth === 0 ? value : JSON.stringify(value);
  if (typeof value === "function")
    return `[Function ${(value as { name?: string }).name || "anonymous"}]`;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (value === null || typeof value !== "object") return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (depth > 2) return Array.isArray(value) ? "[Array]" : "[Object]";
  if (Array.isArray(value))
    return bracketed(
      value.map((item: unknown) => consoleText(item, depth + 1)),
      "[",
      "]",
    );
  if (value instanceof Map)
    return `Map(${value.size}) ${bracketed(
      [...value].map(
        ([key, item]: [unknown, unknown]) =>
          `${consoleText(key, depth + 1)} => ${consoleText(item, depth + 1)}`,
      ),
      "{",
      "}",
    )}`;
  if (value instanceof Set)
    return `Set(${value.size}) ${bracketed(
      [...value].map((item: unknown) => consoleText(item, depth + 1)),
      "{",
      "}",
    )}`;
  return bracketed(
    Object.entries(value).map(
      ([key, item]) => `${key}: ${consoleText(item, depth + 1)}`,
    ),
    "{",
    "}",
  );
}

/**
 * The formatter as source, for a sandbox that cannot import it: it sets
 * `globalThis.faridaShow` wherever it runs.
 */
export const consoleSource = `${bracketed.toString()}\nglobalThis.faridaShow = ${consoleText.toString()};\n`;
