import { availableModules, limitsOf } from "@faridalms/domain/plans";
import { Badge } from "@faridalms/ui/badge";
import { buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Usage } from "../components/Usage";
import { formatWhen, MODULE_NAMES } from "../format";
import { listSchools } from "../server/directory";

export const Route = createFileRoute("/")({
  loader: () => listSchools(),
  component: Schools,
});

function Schools() {
  const schools = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = schools.filter(
    (school) =>
      !needle ||
      [school.slug, school.nameEn, school.nameAr, school.tenantNameEn]
        .filter(Boolean)
        .some((text) => text?.toLowerCase().includes(needle)),
  );
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Schools</h1>
          <p className="text-sm text-muted-foreground">
            Every school on the platform, with its storage and the modules its
            plan includes. Usage is what each school's cell last reported.
          </p>
        </div>
        <Link to="/schools/new" className={buttonVariants()}>
          New school
        </Link>
      </div>
      <Input
        type="search"
        aria-label="Search schools"
        placeholder="Search by name or address"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="max-w-sm"
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Cell</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Modules</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((school) => (
              <TableRow key={school.id}>
                <TableCell>
                  <Link
                    to="/schools/$schoolId"
                    params={{ schoolId: school.id }}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {school.nameEn ?? school.nameAr ?? school.slug}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {school.slug}
                    {school.placement === "legacy" ? " · legacy" : ""}
                    {school.tenantState === "active"
                      ? ""
                      : ` · ${school.tenantState}`}
                  </div>
                </TableCell>
                <TableCell>
                  {school.tenantNameEn ?? school.tenantNameAr ?? "None"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {school.cellId} · {school.region}
                </TableCell>
                <TableCell>
                  <Usage
                    usedBytes={school.usage?.usedBytes ?? null}
                    limitBytes={limitsOf(school.plan).poolBytes}
                  />
                  {school.usage ? (
                    <div className="text-xs text-muted-foreground">
                      Measured {formatWhen(school.usage.measuredAt)}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {availableModules(school.plan).map((module) => (
                      <Badge key={module} variant="secondary">
                        {MODULE_NAMES[module]}
                      </Badge>
                    ))}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
