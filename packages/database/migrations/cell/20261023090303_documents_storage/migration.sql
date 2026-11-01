-- A document is saved every few seconds while someone writes it, so what a
-- save costs is what editing costs.
--
-- The search entry is rebuilt only when the words, the status or the school
-- change. "update of plain_text" fires whenever a statement sets the column,
-- and every save sets it, so a title change or a save of the same words
-- parsed the whole text in two languages again.

drop trigger index_document on core.documents;
create trigger index_document after insert on core.documents
  for each row execute function app.index_document();
create trigger index_document_change after update of plain_text, status, org_id on core.documents
  for each row
  when (old.plain_text is distinct from new.plain_text or old.status is distinct from new.status
        or old.org_id is distinct from new.org_id)
  execute function app.index_document();

drop trigger index_translation on core.document_translations;
create trigger index_translation after insert on core.document_translations
  for each row execute function app.index_translation();
create trigger index_translation_change after update of plain_text, status on core.document_translations
  for each row
  when (old.plain_text is distinct from new.plain_text or old.status is distinct from new.status)
  execute function app.index_translation();

-- lz4 compresses a large document several times faster than pglz for about
-- the same size, which each save pays. Values already stored keep their
-- compression until they are next written.

alter table core.documents
  alter column content set compression lz4,
  alter column plain_text set compression lz4,
  alter column ydoc set compression lz4;
alter table core.document_versions
  alter column content set compression lz4,
  alter column plain_text set compression lz4,
  alter column ydoc_snapshot set compression lz4;
alter table core.document_translations
  alter column content set compression lz4,
  alter column plain_text set compression lz4;
