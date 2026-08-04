begin;

alter table public.orders
  add column source_system text,
  add column source_order_id text,
  add column source_status text,
  add column contact_name text,
  add column whatsapp text,
  add column items jsonb not null default '[]'::jsonb,
  add column total numeric(14, 2),
  add constraint orders_items_array_check check (jsonb_typeof(items) = 'array'),
  add constraint orders_total_nonnegative_check check (total is null or total >= 0),
  add constraint orders_source_identity_check check (
    (source_system is null and source_order_id is null)
    or (nullif(trim(source_system), '') is not null and nullif(trim(source_order_id), '') is not null)
  );

create unique index orders_source_identity_idx
on public.orders(source_system, source_order_id)
where source_system is not null and source_order_id is not null;

create or replace function public.import_external_order(
  requested_source_system text,
  requested_source_order_id text,
  requested_client_name text,
  requested_contact_name text,
  requested_whatsapp text,
  requested_items jsonb,
  requested_source_status text,
  requested_status text,
  requested_total numeric,
  requested_created_at timestamptz,
  requested_notes text
) returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_client_id uuid;
  stored_client_name text;
  sequence_number bigint;
  base_code text;
  generated_code text;
  code_suffix integer := 1;
  mapped_status public.order_status;
  existing_order_id uuid;
  imported_order public.orders;
begin
  if nullif(trim(requested_source_system), '') is null
    or nullif(trim(requested_source_order_id), '') is null then
    raise exception 'SOURCE_IDENTITY_REQUIRED';
  end if;

  if nullif(trim(requested_client_name), '') is null then
    raise exception 'CLIENT_NAME_REQUIRED';
  end if;

  if jsonb_typeof(coalesce(requested_items, '[]'::jsonb)) <> 'array' then
    raise exception 'ORDER_ITEMS_MUST_BE_AN_ARRAY';
  end if;

  begin
    mapped_status := requested_status::public.order_status;
  exception when invalid_text_representation then
    raise exception 'INVALID_ORDER_STATUS';
  end;

  perform pg_advisory_xact_lock(hashtext(
    'external-order:' || trim(requested_source_system) || ':' || trim(requested_source_order_id)
  ));

  insert into public.client_folders (name)
  values (trim(requested_client_name))
  on conflict (normalized_name) do nothing
  returning id, name into requested_client_id, stored_client_name;

  if requested_client_id is null then
    select id, name into requested_client_id, stored_client_name
    from public.client_folders
    where normalized_name = lower(trim(requested_client_name));
  end if;

  select id into existing_order_id
  from public.orders
  where source_system = trim(requested_source_system)
    and source_order_id = trim(requested_source_order_id)
  for update;

  if existing_order_id is not null then
    update public.orders
    set
      client_id = requested_client_id,
      client_name = stored_client_name,
      status = mapped_status,
      notes = coalesce(requested_notes, ''),
      source_status = nullif(trim(requested_source_status), ''),
      contact_name = nullif(trim(requested_contact_name), ''),
      whatsapp = nullif(trim(requested_whatsapp), ''),
      items = coalesce(requested_items, '[]'::jsonb),
      total = requested_total,
      created_at = coalesce(requested_created_at, created_at)
    where id = existing_order_id
      and row(
        client_id,
        client_name,
        status,
        notes,
        source_status,
        contact_name,
        whatsapp,
        items,
        total,
        created_at
      ) is distinct from row(
        requested_client_id,
        stored_client_name,
        mapped_status,
        coalesce(requested_notes, ''),
        nullif(trim(requested_source_status), ''),
        nullif(trim(requested_contact_name), ''),
        nullif(trim(requested_whatsapp), ''),
        coalesce(requested_items, '[]'::jsonb),
        requested_total,
        coalesce(requested_created_at, created_at)
      )
    returning * into imported_order;

    if imported_order.id is null then
      select * into imported_order
      from public.orders
      where id = existing_order_id;
    end if;

    return imported_order;
  end if;

  update public.order_code_sequences
  set next_number = next_number + 1
  where prefix = 'CLASH'
  returning next_number - 1 into sequence_number;

  if sequence_number is null then
    raise exception 'Unknown order prefix';
  end if;

  base_code := 'CLASH-' || to_char(
    timezone('America/Argentina/Buenos_Aires', coalesce(requested_created_at, now())),
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
    status,
    notes,
    source_system,
    source_order_id,
    source_status,
    contact_name,
    whatsapp,
    items,
    total,
    created_by,
    created_at,
    delivered_at
  ) values (
    generated_code,
    sequence_number,
    requested_client_id,
    stored_client_name,
    mapped_status,
    coalesce(requested_notes, ''),
    trim(requested_source_system),
    trim(requested_source_order_id),
    nullif(trim(requested_source_status), ''),
    nullif(trim(requested_contact_name), ''),
    nullif(trim(requested_whatsapp), ''),
    coalesce(requested_items, '[]'::jsonb),
    requested_total,
    null,
    coalesce(requested_created_at, now()),
    case when mapped_status = 'delivered' then coalesce(requested_created_at, now()) else null end
  )
  returning * into imported_order;

  return imported_order;
end;
$$;

revoke all on function public.import_external_order(text, text, text, text, text, jsonb, text, text, numeric, timestamptz, text) from public;
grant execute on function public.import_external_order(text, text, text, text, text, jsonb, text, text, numeric, timestamptz, text) to service_role;

commit;

notify pgrst, 'reload schema';
