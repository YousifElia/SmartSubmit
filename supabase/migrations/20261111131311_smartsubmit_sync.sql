-- SmartSubmit sync: end-to-end encrypted.
--
-- The server only ever stores ciphertext. Each row is one record (a profile,
-- resume, saved answer, tracked job…) encrypted in the browser with a key the
-- server never sees. Even the kind of record is hidden: rows are addressed by
-- an opaque id derived from that key.

-- ── Each account's data key, wrapped (encrypted) with a key derived from the
-- user's password. ──
create table public.vault_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- base64(version | iv | AES-GCM(data key)); see src/core/sync/crypto.ts
  wrapped_key text not null,
  -- The previous wrapping, kept while a password change completes.
  previous_wrapped_key text,
  -- How the wrapping key is derived, so it can change later without guessing.
  kdf jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vault_keys enable row level security;

create policy "Accounts read their own key" on public.vault_keys
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Accounts create their own key" on public.vault_keys
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Accounts update their own key" on public.vault_keys
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── Encrypted records ──
create sequence public.records_seq;

create table public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- base64url(HMAC(record key, collection/id)): stable, but meaningless to the server.
  rid text not null check (char_length(rid) between 16 and 64),
  -- base64(version | iv | AES-GCM(json)), or null once deleted.
  ciphertext text,
  deleted boolean not null default false,
  -- When the change was made, in milliseconds, as the client saw it. The
  -- newest change wins.
  updated_at bigint not null,
  -- Increases on every write, so clients can ask for what changed since.
  seq bigint not null default nextval('public.records_seq'),
  primary key (user_id, rid),
  constraint deleted_has_no_content check (not deleted or ciphertext is null),
  constraint kept_has_content check (deleted or ciphertext is not null)
);

create index records_user_seq on public.records (user_id, seq);

alter table public.records enable row level security;

create policy "Accounts read their own records" on public.records
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Accounts add their own records" on public.records
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Accounts change their own records" on public.records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Accounts remove their own records" on public.records
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.vault_keys, public.records from anon;

-- Write a batch of records. A row is only replaced by a newer change, so two
-- browsers syncing at once can't put an older version back.
create function public.push_records(items jsonb)
returns table (rid text, accepted boolean, seq bigint)
language plpgsql
security invoker
set search_path = ''
as $$
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

-- Delete the signed-in account and, through the cascades above, all of its
-- rows. Files are removed through the Storage API before this is called.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ── Encrypted files (uploaded resumes), one folder per account ──
insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 20971520)
on conflict (id) do nothing;

create policy "Accounts read their own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Accounts add their own files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Accounts replace their own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Accounts remove their own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
