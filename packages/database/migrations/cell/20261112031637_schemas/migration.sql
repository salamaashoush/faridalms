create schema ext;
create extension btree_gist with schema ext;
create extension btree_gin with schema ext;
create extension pg_trgm with schema ext;

create schema app;
create schema core;
create schema health;
create schema audit;
create schema parts;
create schema search;
create schema staging;
create schema ops;

-- Codes read with their numbers as numbers, so "RL.3.2" comes before
-- "RL.3.10". Postgres ships no collation that orders digits by value.
create collation core.natural (provider = icu, locale = 'und-u-kn-true');

-- Partitions do not inherit row level security, so no runtime role may reach
-- parts, and search is reached only through app.search.
revoke all on schema public from public;
grant usage on schema app, core to app, site, integration, worker, collab, cell_io, retention;
grant usage on schema audit to app, integration, worker, cell_io, retention;
grant usage on schema health to app, worker, cell_io, retention;
grant usage, create on schema staging to cell_io;
grant usage on schema ops to worker;
