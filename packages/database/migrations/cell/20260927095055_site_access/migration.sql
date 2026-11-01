-- What the generated migration cannot express for the website: row triggers,
-- forced row level security and the grants of the access profiles. The site
-- role reads settings, categories and the published copies, nothing else.

create trigger row_meta before insert or update on core.site_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_pages for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_categories for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_posts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_published_pages for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_published_posts for each row execute function app.row_meta();

alter table core.site_settings force row level security;
alter table core.site_pages force row level security;
alter table core.site_categories force row level security;
alter table core.site_posts force row level security;
alter table core.site_published_pages force row level security;
alter table core.site_published_posts force row level security;

grant select, insert, update on core.site_settings, core.site_pages, core.site_categories, core.site_posts,
  core.site_published_pages, core.site_published_posts
  to app, worker, cell_io;
grant select on core.site_settings, core.site_pages, core.site_categories, core.site_posts,
  core.site_published_pages, core.site_published_posts
  to retention;
grant select on core.site_settings, core.site_categories, core.site_published_pages, core.site_published_posts
  to site;
