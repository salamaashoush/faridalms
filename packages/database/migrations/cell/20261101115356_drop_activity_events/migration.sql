-- Dropping the partitioned table drops its partitions, policies and grants
-- with it; partition upkeep stops once its registration is gone.
DELETE FROM ops.partitioned_tables WHERE schema_name = 'core' AND table_name = 'activity_events';
DROP TABLE core.activity_events;
