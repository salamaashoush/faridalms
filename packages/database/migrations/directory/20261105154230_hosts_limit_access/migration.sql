-- A cell adds its schools' hosts through directory_sync, and a school may hold
-- only as many as it is entitled to, which the same transaction reads.
grant select (school_id, custom_domains) on school_entitlements to directory_sync;
