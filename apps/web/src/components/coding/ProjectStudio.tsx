import { languageOf } from "@faridalms/domain/project";

import type { StudioProps } from "./WebProjectStudio";

import { DeviceStudio } from "./DeviceStudio";
import { WebProjectStudio } from "./WebProjectStudio";

/**
 * The studio a project is built in: the board's own editor for a
 * micro:bit project, and for a web page or a Python program the files to
 * write beside what they make.
 */
export function ProjectStudio(props: StudioProps) {
  return languageOf(props.files) === "microbit" ? (
    <DeviceStudio {...props} />
  ) : (
    <WebProjectStudio {...props} />
  );
}
