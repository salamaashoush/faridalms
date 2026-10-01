-- An approved erasure removes the links from the documents it redacts to the
-- files it deletes; without them a listed file could never be deleted.

grant update (status, metadata) on core.document_files to retention;
grant delete on core.document_files to retention;
