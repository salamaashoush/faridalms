/**
 * The lines of a program that the one before lacks, by the longest run of
 * lines the two share in order, so a line moved or edited shows while the
 * lines around it stay quiet.
 */
export function changedLines(before: string[], after: string[]): Set<number> {
  const rows = before.length;
  const columns = after.length;
  const longest = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: columns + 1 }, () => 0),
  );
  for (let row = rows - 1; row >= 0; row--)
    for (let column = columns - 1; column >= 0; column--) {
      const here = longest[row];
      const below = longest[row + 1];
      if (!here || !below) continue;
      here[column] =
        before[row] === after[column]
          ? (below[column + 1] ?? 0) + 1
          : Math.max(below[column] ?? 0, here[column + 1] ?? 0);
    }
  const changed = new Set<number>();
  let row = 0;
  let column = 0;
  while (column < columns) {
    if (row < rows && before[row] === after[column]) {
      row++;
      column++;
    } else if (
      row < rows &&
      (longest[row + 1]?.[column] ?? 0) >= (longest[row]?.[column + 1] ?? 0)
    )
      row++;
    else {
      changed.add(column);
      column++;
    }
  }
  return changed;
}
