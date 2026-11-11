-- push_records returns columns named like the table's (rid, seq), and
-- PL/pgSQL treats those output names as variables, which made references
-- such as the ON CONFLICT target ambiguous. Prefer the table's columns.
create or replace function public.push_records(items jsonb)
returns table (rid text, accepted boolean, seq bigint)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_array_length(items) > 500 then
    raise exception 'too many records in one batch';
  end if;
  return query
  with incoming as (
    select distinct on (x ->> 'rid')
      x ->> 'rid' as rid,
      x ->> 'ciphertext' as ciphertext,
      coalesce((x ->> 'deleted')::boolean, false) as deleted,
      (x ->> 'updated_at')::bigint as updated_at
    from jsonb_array_elements(items) as x
    order by x ->> 'rid', (x ->> 'updated_at')::bigint desc
  ),
  written as (
    insert into public.records as r (user_id, rid, ciphertext, deleted, updated_at, seq)
    select auth.uid(), i.rid, case when i.deleted then null else i.ciphertext end, i.deleted, i.updated_at, nextval('public.records_seq')
    from incoming i
    on conflict (user_id, rid) do update
      set ciphertext = excluded.ciphertext,
          deleted = excluded.deleted,
          updated_at = excluded.updated_at,
          seq = excluded.seq
      where r.updated_at < excluded.updated_at
    returning r.rid, r.seq
  )
  select i.rid, w.rid is not null, w.seq
  from incoming i
  left join written w on w.rid = i.rid;
end;
$$;

revoke execute on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
