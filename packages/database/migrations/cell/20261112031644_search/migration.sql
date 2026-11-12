-- One row per searchable thing, written by the index triggers and read only
-- through app.search. It has no row level security, so no runtime role may
-- reach the schema.
create table search.entries (
  tenant_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  result_type text not null,
  result_id uuid not null,
  org_ids uuid[] not null default '{}',
  name_norm text,
  text_vector tsvector,
  primary key (tenant_id, entity_type, entity_id)
);
create index entries_name_idx on search.entries using gin (tenant_id, name_norm ext.gin_trgm_ops);
create index entries_text_idx on search.entries using gin (tenant_id, text_vector);
create index entries_org_idx on search.entries using gin (tenant_id, org_ids);
