-- A teacher deletes from a file area by marking the file trashed; restoring clears it.
GRANT UPDATE (trashed_at) ON core.files TO app;
