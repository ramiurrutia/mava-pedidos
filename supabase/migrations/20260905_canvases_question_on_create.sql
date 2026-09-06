begin;

drop function if exists public.create_order(text, text, text);

create function public.create_order(
  requested_prefix text,
  requested_client_name text,
  requested_notes text default '',
  requested_canvases_ordered boolean default false
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
  code_suffix integer := 1;
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

  generated_code := base_code;
  while exists (select 1 from public.orders where code = generated_code) loop
    code_suffix := code_suffix + 1;
    generated_code := base_code || '-' || lpad(code_suffix::text, 2, '0');
  end loop;

  insert into public.orders (
    code,
    code_number,
    client_id,
    client_name,
    notes,
    canvases_ordered,
    created_by
  ) values (
    generated_code,
    sequence_number,
    requested_client_id,
    stored_client_name,
    coalesce(requested_notes, ''),
    coalesce(requested_canvases_ordered, false),
    null
  )
  returning * into created_order;

  return created_order;
end;
$$;

revoke all on function public.create_order(text, text, text, boolean) from public;
grant execute on function public.create_order(text, text, text, boolean) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
