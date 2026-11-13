import { getYoungClassMark } from "~/server/early-years";

/** Whether the school marked a class for young children, as its form starts from; a new class is not. */
export const youngClassPartQuery = (classId: string | null) => ({
  queryKey: ["early-years", "class", classId ?? ""],
  queryFn: async () =>
    classId ? await getYoungClassMark({ data: { classId } }) : { young: false },
});
