// Attendance holds this lock in shared mode while checking enrollment; year,
// class and enrollment changes take it exclusively until their writes commit.
export const ACADEMIC_STRUCTURE_LOCK = 741904;
