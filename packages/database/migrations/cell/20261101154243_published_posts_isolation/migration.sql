-- The website's copies of posts answer to their tenant again now that their
-- key to the broadcast is in place.

alter table core.site_published_posts force row level security;
