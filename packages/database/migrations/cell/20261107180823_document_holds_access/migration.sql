-- What the generated migration cannot express for document holds: forced
-- row level security and the grants of the ephemeral profile. A hold is
-- renewed and taken over in place, and swept once it has lapsed.

alter table core.document_holds force row level security;

grant select, insert, update on core.document_holds to app, worker;
grant select, delete on core.document_holds to retention;
