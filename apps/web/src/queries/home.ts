import { queryOptions } from "@tanstack/react-query";

import {
  getAdminHome,
  getLearnerDetails,
  getFollowedHome,
  getStudentHome,
  getTeacherHome,
} from "~/server/home";

export const teacherHomeQuery = queryOptions({
  queryKey: ["home", "teacher"],
  queryFn: () => getTeacherHome(),
});

export const followedHomeQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["home", "followed", studentId],
    queryFn: () => getFollowedHome({ data: { studentId } }),
    placeholderData: (previous) => previous,
  });

export const learnerDetailsQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["home", "details", studentId],
    queryFn: () => getLearnerDetails({ data: { studentId } }),
  });

export const studentHomeQuery = queryOptions({
  queryKey: ["home", "student"],
  queryFn: () => getStudentHome(),
});

export const adminHomeQuery = queryOptions({
  queryKey: ["home", "admin"],
  queryFn: () => getAdminHome(),
});
