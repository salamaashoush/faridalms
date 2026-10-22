/**
 * Peer review: students review classmates' handed-in work against the
 * work's rubric, when it has one, and with two prompts every time: what
 * works well, and what would make it better. It is formative: it helps
 * the work and the reviewer, and the teacher's mark stays the teacher's.
 */

/** One student reviewing one classmate's work. */
export interface Pairing {
  reviewerId: string;
  authorId: string;
}

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other] as T, out[index] as T];
  }
  return out;
};

/**
 * Who reviews whom among the students whose work is in, as many reviews
 * each as asked and never their own. The first time, students stand in a
 * shuffled ring and each reviews the next ones along, so every student
 * gives and receives the same number. Work handed in later joins with the
 * fewest-loaded classmates on both sides, keeping the reviews even.
 */
export function allocateReviews(input: {
  existing: readonly Pairing[];
  students: readonly string[];
  reviews: number;
  random?: () => number;
}): Pairing[] {
  const random = input.random ?? Math.random;
  const students = [...new Set(input.students)];
  const each = Math.min(input.reviews, students.length - 1);
  if (each < 1) return [];
  const placed = new Set(
    input.existing.flatMap((pair) => [pair.reviewerId, pair.authorId]),
  );
  const newcomers = shuffled(
    students.filter((student) => !placed.has(student)),
    random,
  );
  if (input.existing.length === 0) {
    const ring = newcomers;
    return ring.flatMap((reviewerId, index) =>
      Array.from({ length: each }, (_, step) => ({
        reviewerId,
        authorId: ring[(index + step + 1) % ring.length] as string,
      })),
    );
  }
  const given = new Map(students.map((student) => [student, 0]));
  const received = new Map(students.map((student) => [student, 0]));
  const paired = new Set<string>();
  const pair = (reviewerId: string, authorId: string) => {
    paired.add(`${reviewerId}:${authorId}`);
    given.set(reviewerId, (given.get(reviewerId) ?? 0) + 1);
    received.set(authorId, (received.get(authorId) ?? 0) + 1);
  };
  for (const row of input.existing) pair(row.reviewerId, row.authorId);
  const added: Pairing[] = [];
  const fewest = (
    load: ReadonlyMap<string, number>,
    open: (student: string) => boolean,
  ) =>
    shuffled(students.filter(open), random)
      .toSorted((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))
      .slice(0, each);
  for (const student of newcomers) {
    for (const authorId of fewest(
      received,
      (other) => other !== student && !paired.has(`${student}:${other}`),
    )) {
      pair(student, authorId);
      added.push({ reviewerId: student, authorId });
    }
    for (const reviewerId of fewest(
      given,
      (other) => other !== student && !paired.has(`${other}:${student}`),
    )) {
      pair(reviewerId, student);
      added.push({ reviewerId, authorId: student });
    }
  }
  return added;
}
