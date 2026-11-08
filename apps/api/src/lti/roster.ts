import type { LtiCourse } from "@faridalms/database/stores/lti";

import { writeAudit } from "@faridalms/database/audit";
import { documentOf } from "@faridalms/database/stores/documents";
import { courseMembers, toolById } from "@faridalms/database/stores/lti";
import {
  COURSE_OFFERING,
  LTI_CLAIM,
  LTI_CONTEXT_ROLES,
  LTI_NRPS_CLAIM,
  LTI_NRPS_SCOPE,
} from "@faridalms/domain/lti";

import type { SchoolContext } from "../core/context";

import {
  asSystem,
  bearerOf,
  courseKey,
  grants,
  isToolLink,
  nextLink,
  pageSize,
  placeOf,
  unauthorized,
} from "./grades";
import { courseNamed, findLink, issuerOf, refused, secretsFor } from "./shared";

const ID = /^[0-9a-f-]{36}$/;
const MEMBERSHIPS = "application/vnd.ims.lti-nrps.v2.membershipcontainer+json";

/**
 * Where a tool reads a course's class list. Like its grades, the address
 * carries a tag only this cell can make for that tool and course, so a
 * tool reaches only the courses it was launched in.
 */
export async function membershipsUrl(
  context: SchoolContext,
  toolId: string,
  course: LtiCourse,
) {
  const [kind, id] = courseKey(course);
  const tag = await secretsFor(context).tag(`members:${toolId}:${kind}:${id}`);
  return `${issuerOf(context.school)}/nrps/${kind}/${id}/${tag}/memberships`;
}

/** What a launch tells a tool of where its course's class list is. */
export async function rosterClaim(
  context: SchoolContext,
  toolId: string,
  course: LtiCourse,
) {
  return {
    [LTI_NRPS_CLAIM]: {
      context_memberships_url: await membershipsUrl(context, toolId, course),
      service_versions: ["2.0"],
    },
  };
}

/** A role a tool asks for, in full or by its short context name. */
function roleAsked(
  asked: string | null,
): "Learner" | "Instructor" | null | undefined {
  if (asked === null || asked === "") return undefined;
  for (const [name, full] of Object.entries(LTI_CONTEXT_ROLES))
    if (asked === name || asked === full)
      return name as "Learner" | "Instructor";
  return null;
}

/**
 * The school's class lists for tools, LTI's Names and Role Provisioning
 * Services: who is in a course the tool was launched in, by the id its
 * launches give them and their role there, with names only when the
 * school sends names to the tool. A tool asking about one of its links
 * gets the message each member would be launched with. Each call is
 * recorded, since it hands a list of children to someone outside.
 */
export async function rosterService(
  context: SchoolContext,
  request: Request,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.slice("/lti/nrps/".length).split("/");
  const [kind, id = "", tag = "", resource] = parts;
  if (
    parts.length !== 4 ||
    (kind !== "module" && kind !== "class") ||
    !ID.test(id) ||
    resource !== "memberships"
  )
    return refused(404, "NOT_FOUND");
  if (request.method !== "GET") return refused(405, "METHOD_NOT_ALLOWED");
  const token = await bearerOf(context, request);
  if (!token) return unauthorized();
  const course: LtiCourse =
    kind === "module" ? { moduleId: id } : { classId: id };
  const tenantId = context.school.tenantId;
  return context.cell.withTenant(asSystem(context), "write", async (tx) => {
    const tool = await toolById(tx, {
      tenantId,
      orgId: context.school.schoolId,
      id: token.toolId,
    });
    if (!tool) return unauthorized();
    if (!grants(token, tool, LTI_NRPS_SCOPE))
      return refused(403, "insufficient_scope");
    if (
      !(await secretsFor(context).tagged(
        `members:${tool.id}:${kind}:${id}`,
        tag,
      ))
    )
      return refused(404, "NOT_FOUND");
    const named = await courseNamed(tx, context, course);
    if (!named) return refused(404, "NOT_FOUND");
    const role = roleAsked(url.searchParams.get("role"));
    const rlid = url.searchParams.get("rlid");
    // Asked about a link, the tool must own it and it must be in the course.
    let custom: Record<string, string> | null = null;
    if (rlid !== null) {
      const place = placeOf(course, rlid);
      if (!place || !(await isToolLink(tx, tenantId, tool, course, place)))
        return refused(403, "FORBIDDEN");
      const host = place.lessonId
        ? { type: "lesson" as const, id: place.lessonId }
        : { type: "assignment" as const, id: place.assignmentId ?? "" };
      const document = await documentOf(tx, tenantId, host);
      const link = findLink(document?.content, place.linkId);
      custom = { ...tool.custom, ...link?.custom };
    }
    const after = url.searchParams.get("after") ?? "";
    const limit = pageSize(url);
    const rows =
      role === null
        ? []
        : await courseMembers(tx, {
            tenantId,
            course,
            role,
            after: ID.test(after) ? after : undefined,
            limit: limit + 1,
          });
    const page = rows.slice(0, limit);
    await writeAudit(tx, tenantId, {
      action: "lti_tool.roster_read",
      objectType: "lti_tool",
      objectId: tool.id,
      orgId: context.school.schoolId,
      details: { course: kind, courseId: id, members: page.length },
    });
    const members = page.map((member) => ({
      status: "Active",
      user_id: member.userId,
      roles: member.roles.map((name) => LTI_CONTEXT_ROLES[name]),
      ...(tool.sendNames
        ? {
            ...(member.name ? { name: member.name } : {}),
            ...(member.givenName ? { given_name: member.givenName } : {}),
            ...(member.familyName ? { family_name: member.familyName } : {}),
          }
        : {}),
      ...(custom
        ? {
            message: [
              {
                [LTI_CLAIM.messageType]: "LtiResourceLinkRequest",
                [LTI_CLAIM.custom]: custom,
              },
            ],
          }
        : {}),
    }));
    const search = url.search ? url.search : "";
    const last = page.at(-1);
    return new Response(
      JSON.stringify({
        id: `${issuerOf(context.school)}${url.pathname.slice("/lti".length)}${search}`,
        context: { id: named.id, title: named.title, type: [COURSE_OFFERING] },
        members,
      }),
      {
        headers: {
          "content-type": MEMBERSHIPS,
          ...(rows.length > limit && last
            ? nextLink(context, url, last.userId)
            : {}),
        },
      },
    );
  });
}
