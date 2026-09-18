import * as academicYears from "./modules/academic-years";
import * as academics from "./modules/academics";
import * as administration from "./modules/administration";
import * as auth from "./modules/auth";
import * as communication from "./modules/communication";
import * as newsletters from "./modules/newsletters";
import * as overviews from "./modules/overviews";
import * as students from "./modules/students";
import * as teaching from "./modules/teaching";

export const router = {
  auth,
  ...students,
  ...overviews,
  ...teaching,
  ...administration,
  ...academics,
  ...academicYears,
  ...communication,
  ...newsletters,
};
export type AppRouter = typeof router;
