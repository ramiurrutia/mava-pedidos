begin;

drop function if exists public.create_order(text, uuid, text);

create or replace function public.create_order(
  requested_prefix text,
  requested_client_name text,
  requested_notes text default ''
) returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  sequence_number bigint;
  requested_client_id uuid;
  stored_client_name text;
  base_code text;
  generated_code text;
  matching_codes integer;
  created_order public.orders;
begin
  if nullif(trim(requested_client_name), '') is null then
    raise exception 'CLIENT_NAME_REQUIRED';
  end if;

  insert into public.client_folders (name)
  values (trim(requested_client_name))
  on conflict (normalized_name) do nothing
  returning id, name into requested_client_id, stored_client_name;

  if requested_client_id is null then
    select id, name into requested_client_id, stored_client_name
    from public.client_folders
    where normalized_name = lower(trim(requested_client_name));
  end if;

  update public.order_code_sequences
  set next_number = next_number + 1
  where prefix = upper(requested_prefix)
  returning next_number - 1 into sequence_number;

  if sequence_number is null then
    raise exception 'Unknown order prefix';
  end if;

  base_code := upper(requested_prefix) || '-' || to_char(
    timezone('America/Argentina/Buenos_Aires', now()),
    'DDMMYYYY-HH24MI'
  );
  perform pg_advisory_xact_lock(hashtext(base_code));

  select count(*) into matching_codes
  from public.orders
  where code = base_code or code like base_code || '-%';

  generated_code := case
    when matching_codes = 0 then base_code
    else base_code || '-' || lpad((matching_codes + 1)::text, 2, '0')
  end;

  insert into public.orders (code, code_number, client_id, client_name, notes, created_by)
  values (
    generated_code,
    sequence_number,
    requested_client_id,
    stored_client_name,
    coalesce(requested_notes, ''),
    null
  )
  returning * into created_order;

  return created_order;
end;
$$;

revoke all on function public.create_order(text, text, text) from public;
grant execute on function public.create_order(text, text, text) to anon, authenticated;

delete from public.client_folders as folder
where not exists (
  select 1
  from public.orders
  where orders.client_id = folder.id
);

commit;

notify pgrst, 'reload schema';
