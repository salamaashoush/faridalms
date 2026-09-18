ALTER TYPE "permission" ADD VALUE 'student-profile:read' BEFORE 'children:read';--> statement-breakpoint
ALTER TYPE "permission" ADD VALUE 'student-contacts:read' BEFORE 'children:read';--> statement-breakpoint
ALTER TYPE "permission" ADD VALUE 'student-medical:read' BEFORE 'children:read';