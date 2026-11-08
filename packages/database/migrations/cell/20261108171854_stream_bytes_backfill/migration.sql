-- Streams finished since the media service began reporting their weight
-- carry it in their derivatives, as do the copies made of their files.
-- Older ones say 0 there and stay unmeasured, for the files sweep to weigh
-- in the store.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.files
    set stream_bytes = (derivatives -> 'hls' ->> 'size')::bigint
    where tenant_id = t and stream_bytes is null
      and jsonb_typeof(derivatives -> 'hls' -> 'size') = 'number'
      and (derivatives -> 'hls' ->> 'size')::bigint > 0;
  end loop;
end $$;
