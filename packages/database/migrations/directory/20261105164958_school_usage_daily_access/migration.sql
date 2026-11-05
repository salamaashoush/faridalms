-- Each cell writes its schools' daily counts, as it writes their usage; the
-- console reads them.
grant select, insert, update on school_usage_daily to directory_sync;
grant select on school_usage_daily to directory_admin, directory_reader;
