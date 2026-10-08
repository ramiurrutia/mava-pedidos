-- Replace workflow stages with pending/archive, preserving all order content.
-- Existing workflow states become pending by explicit user choice.
-- Run after 20261006_pdf_attachments_for_all_orders.sql.
begin;

-- Archiving is organizational: it must not mark canvases or artwork as ready.
drop trigger if exists orders_complete_terminal_insert on public.orders;
drop trigger if exists orders_complete_terminal_status on public.orders;

-- Retain enum values for historical status records and older integration clients.
-- Do not unarchive orders if this migration is run again.
update public.orders set status='pending'
where status in ('in_production','finished','delivered','cancelled');

create or replace function public.normalize_order_archive_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'archived' then new.status := 'pending'; end if;
  return new;
end;
$$;
drop trigger if exists orders_normalize_archive_status on public.orders;
create trigger orders_normalize_archive_status before insert or update of status on public.orders
for each row execute function public.normalize_order_archive_status();

alter table public.orders drop constraint if exists orders_current_status_check;
alter table public.orders add constraint orders_current_status_check check (status in ('pending','archived'));

create or replace function public.set_order_archive_status(requested_order_id uuid,requested_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if requested_status is null or requested_status not in ('pending','archived') then raise exception 'INVALID_ORDER_STATUS'; end if;
  perform 1 from public.orders where id=requested_order_id and deleted_at is null for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  update public.orders set status=requested_status::public.order_status
    where id=requested_order_id and status is distinct from requested_status::public.order_status;
  return true;
end;
$$;
revoke all on function public.normalize_order_archive_status() from public;
revoke all on function public.set_order_archive_status(uuid,text) from public;
grant execute on function public.set_order_archive_status(uuid,text) to anon,authenticated;

-- Synced orders arrive pending; later syncs refresh their data but preserve archive decisions.
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
    mapped_status := 'pending'::public.order_status;
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
      client_id = case when has_local_edits then client_id else requested_client_id end,
      client_name = case when has_local_edits then client_name else stored_client_name end,
      notes = case when has_local_edits then notes else coalesce(requested_notes, '') end,
      source_status = nullif(trim(requested_source_status), ''),
      contact_name = case when has_local_edits then contact_name else nullif(trim(requested_contact_name), '') end,
      whatsapp = case when has_local_edits then whatsapp else nullif(trim(requested_whatsapp), '') end,
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
        case when has_local_edits then client_id else requested_client_id end,
        case when has_local_edits then client_name else stored_client_name end,
        status,
        case when has_local_edits then notes else coalesce(requested_notes, '') end,
        nullif(trim(requested_source_status), ''),
        case when has_local_edits then contact_name else nullif(trim(requested_contact_name), '') end,
        case when has_local_edits then whatsapp else nullif(trim(requested_whatsapp), '') end,
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

notify pgrst,'reload schema';
commit;
