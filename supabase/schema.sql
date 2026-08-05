create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.order_status as enum (
  'pending',
  'in_production',
  'finished',
  'delivered',
  'cancelled',
  'archived'
);

create type public.image_source as enum ('web', 'whatsapp');
create type public.upload_status as enum ('pending', 'ready', 'failed');

create table public.order_code_sequences (
  prefix text primary key,
  next_number bigint not null check (next_number > 0)
);

insert into public.order_code_sequences (prefix, next_number)
values ('CLASH', 1)
on conflict (prefix) do nothing;

create table public.client_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint client_folders_name_length_check
    check (length(trim(name)) between 1 and 80),
  normalized_name text generated always as (lower(trim(name))) stored,
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  code_number bigint not null unique,
  client_id uuid not null references public.client_folders(id) on delete restrict,
  client_name text not null constraint orders_client_name_length_check
    check (length(trim(client_name)) between 1 and 80),
  status public.order_status not null default 'pending',
  notes text not null default '',
  source_system text,
  source_order_id text,
  source_status text,
  contact_name text,
  whatsapp text,
  items jsonb not null default '[]'::jsonb
    constraint orders_items_array_check check (jsonb_typeof(items) = 'array'),
  total numeric(14, 2)
    constraint orders_total_nonnegative_check check (total is null or total >= 0),
  has_local_edits boolean not null default false,
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint orders_source_identity_check check (
    (source_system is null and source_order_id is null)
    or (nullif(trim(source_system), '') is not null and nullif(trim(source_order_id), '') is not null)
  )
);

create table public.order_images (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  storage_key text not null unique,
  original_filename text not null constraint order_images_filename_check
    check (length(trim(original_filename)) between 1 and 255),
  description text not null default '' constraint order_images_description_length_check
    check (length(description) <= 1000),
  mime_type text not null constraint order_images_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes bigint not null constraint order_images_size_limit_check
    check (size_bytes between 1 and 6291456),
  checksum_sha256 text,
  source public.image_source not null default 'web',
  upload_status public.upload_status not null default 'pending',
  uploaded_by uuid references auth.users(id),
  whatsapp_message_id text unique,
  created_at timestamptz not null default now()
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references auth.users(id),
  comment text,
  changed_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique constraint push_subscriptions_endpoint_length_check
    check (length(endpoint) between 1 and 2048),
  expiration_time bigint,
  p256dh text not null constraint push_subscriptions_p256dh_length_check
    check (length(p256dh) between 1 and 512),
  auth text not null constraint push_subscriptions_auth_length_check
    check (length(auth) between 1 and 256),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_notification_events (
  order_id uuid primary key references public.orders(id) on delete cascade,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.push_notification_events (order_id, claimed_at, sent_at)
select id, now(), now()
from public.orders
where source_system is not null
on conflict (order_id) do nothing;

create index orders_status_idx on public.orders(status);
create index orders_client_pending_created_idx on public.orders(client_id, created_at desc)
where status = 'pending';
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_client_name_trgm_idx on public.orders using gin (client_name gin_trgm_ops);
create unique index orders_source_identity_idx
on public.orders(source_system, source_order_id)
where source_system is not null and source_order_id is not null;
create index order_images_order_id_idx on public.order_images(order_id);
create index status_history_order_id_idx on public.order_status_history(order_id, changed_at desc);
create index push_notification_events_pending_idx
on public.push_notification_events(created_at)
where sent_at is null;

create or replace function public.claim_pending_order_notifications(requested_order_ids uuid[])
returns table (order_id uuid)
language sql
security definer
set search_path = ''
as $$
  update public.push_notification_events as event
  set claimed_at = now()
  where event.order_id = any(requested_order_ids)
    and event.sent_at is null
    and (event.claimed_at is null or event.claimed_at < now() - interval '5 minutes')
  returning event.order_id;
$$;

create or replace function public.enqueue_new_order_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_notification_events (order_id)
  values (new.id)
  on conflict (order_id) do nothing;
  return new;
end;
$$;

create trigger orders_enqueue_new_order_notification
after insert on public.orders
for each row execute function public.enqueue_new_order_notification();

create or replace function public.preserve_locally_edited_order_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.has_local_edits
    and coalesce(current_setting('mava.allow_order_detail_edit', true), 'false') <> 'true' then
    new.client_id := old.client_id;
    new.client_name := old.client_name;
    new.notes := old.notes;
    new.contact_name := old.contact_name;
    new.whatsapp := old.whatsapp;
    new.has_local_edits := true;
  end if;
  return new;
end;
$$;

create trigger orders_preserve_locally_edited_details
before update on public.orders
for each row execute function public.preserve_locally_edited_order_details();

create or replace function public.reject_images_for_deleted_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders
    where id = new.order_id and deleted_at is not null
  ) then
    raise exception 'ORDER_DELETED';
  end if;
  return new;
end;
$$;

create trigger order_images_reject_deleted_order
before insert on public.order_images
for each row execute function public.reject_images_for_deleted_orders();

create or replace function public.apply_order_update_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;

  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := now();
  elsif new.status <> 'delivered' then
    new.delivered_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by
    ) values (
      new.id,
      old.status,
      new.status,
      null
    );
  end if;

  return new;
end;
$$;

create trigger orders_apply_update_metadata
before update on public.orders
for each row execute function public.apply_order_update_metadata();

create trigger orders_record_status_change
after update of status on public.orders
for each row execute function public.record_order_status_change();

create or replace function public.assign_generic_order_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_code text;
  generated_code text;
  code_suffix integer := 1;
begin
  base_code := 'PEDIDO-' || to_char(
    timezone('America/Argentina/Buenos_Aires', coalesce(new.created_at, now())),
    'DDMMYYYY-HH24MI'
  );
  perform pg_advisory_xact_lock(hashtext('public-order-code:' || base_code));

  generated_code := base_code;
  while exists (select 1 from public.orders where code = generated_code) loop
    code_suffix := code_suffix + 1;
    generated_code := base_code || '-' || lpad(
      code_suffix::text,
      greatest(2, length(code_suffix::text)),
      '0'
    );
  end loop;

  new.code := generated_code;
  return new;
end;
$$;

create trigger orders_assign_generic_code
before insert on public.orders
for each row execute function public.assign_generic_order_code();

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
      client_id = case when has_local_edits then client_id else requested_client_id end,
      client_name = case when has_local_edits then client_name else stored_client_name end,
      status = mapped_status,
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
        mapped_status,
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

create or replace function public.update_order_details(
  requested_order_id uuid,
  requested_client_name text,
  requested_notes text default '',
  requested_contact_name text default null,
  requested_whatsapp text default null
) returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_client_id uuid;
  stored_client_name text;
  updated_order public.orders;
begin
  if nullif(trim(requested_client_name), '') is null
    or length(trim(requested_client_name)) > 80 then
    raise exception 'INVALID_CLIENT_NAME';
  end if;
  if length(coalesce(requested_notes, '')) > 5000 then
    raise exception 'NOTES_TOO_LONG';
  end if;
  if length(coalesce(requested_contact_name, '')) > 120 then
    raise exception 'CONTACT_NAME_TOO_LONG';
  end if;
  if length(coalesce(requested_whatsapp, '')) > 40 then
    raise exception 'WHATSAPP_TOO_LONG';
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

  perform set_config('mava.allow_order_detail_edit', 'true', true);

  update public.orders
  set
    client_id = requested_client_id,
    client_name = stored_client_name,
    notes = coalesce(requested_notes, ''),
    contact_name = nullif(trim(requested_contact_name), ''),
    whatsapp = nullif(trim(requested_whatsapp), ''),
    has_local_edits = true
  where id = requested_order_id
    and deleted_at is null
  returning * into updated_order;

  if updated_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return updated_order;
end;
$$;

create or replace function public.soft_delete_order(requested_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
  set deleted_at = now()
  where id = requested_order_id
    and deleted_at is null;
  return found;
end;
$$;

create or replace function public.prepare_order_image(
  requested_client_id uuid,
  requested_order_id uuid,
  requested_image_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_size_bytes bigint,
  requested_description text default ''
) returns public.order_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  safe_filename text;
  prepared_image public.order_images;
begin
  if nullif(trim(requested_filename), '') is null or length(trim(requested_filename)) > 255 then
    raise exception 'INVALID_IMAGE_FILENAME';
  end if;

  if requested_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception 'UNSUPPORTED_IMAGE_TYPE';
  end if;

  if requested_size_bytes not between 1 and 6291456 then
    raise exception 'IMAGE_SIZE_OUT_OF_RANGE';
  end if;

  if length(coalesce(requested_description, '')) > 1000 then
    raise exception 'IMAGE_DESCRIPTION_TOO_LONG';
  end if;

  if requested_order_id is not null then
    select id into target_order_id
    from public.orders
    where id = requested_order_id
      and client_id = requested_client_id
      and status in ('pending', 'in_production')
      and deleted_at is null
    for update;
  else
    select id into target_order_id
    from public.orders
    where client_id = requested_client_id
      and status in ('pending', 'in_production')
      and deleted_at is null
    order by created_at desc, id desc
    limit 1
    for update;
  end if;

  if target_order_id is null then
    raise exception 'NO_PENDING_ORDER';
  end if;

  safe_filename := regexp_replace(
    coalesce(nullif(trim(requested_filename), ''), 'imagen'),
    '[^a-zA-Z0-9._-]+',
    '-',
    'g'
  );

  insert into public.order_images (
    id,
    order_id,
    storage_key,
    original_filename,
    description,
    mime_type,
    size_bytes,
    uploaded_by
  )
  values (
    requested_image_id,
    target_order_id,
    'orders/' || target_order_id || '/' || requested_image_id || '/' || safe_filename,
    requested_filename,
    trim(coalesce(requested_description, '')),
    requested_mime_type,
    requested_size_bytes,
    null
  )
  returning * into prepared_image;

  return prepared_image;
end;
$$;

create or replace function public.complete_order_image(requested_image_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prepared_storage_key text;
begin
  select storage_key into prepared_storage_key
  from public.order_images
  where id = requested_image_id
    and upload_status = 'pending';

  if prepared_storage_key is null then
    raise exception 'IMAGE_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'order-images'
      and name = prepared_storage_key
  ) then
    raise exception 'IMAGE_NOT_UPLOADED';
  end if;

  update public.order_images
  set upload_status = 'ready'
  where id = requested_image_id
    and upload_status = 'pending';
end;
$$;

create or replace function public.fail_order_image(requested_image_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_images
  set upload_status = 'failed'
  where id = requested_image_id
    and upload_status = 'pending';
end;
$$;

create or replace function public.update_order_image_description(
  requested_image_id uuid,
  requested_description text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_description text;
begin
  if length(coalesce(requested_description, '')) > 1000 then
    raise exception 'IMAGE_DESCRIPTION_TOO_LONG';
  end if;

  update public.order_images
  set description = trim(coalesce(requested_description, ''))
  where id = requested_image_id
    and upload_status = 'ready'
    and exists (
      select 1
      from public.orders
      where orders.id = order_images.order_id
        and orders.deleted_at is null
    )
  returning description into saved_description;

  if not found then
    raise exception 'IMAGE_NOT_FOUND';
  end if;

  return saved_description;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-images',
  'order-images',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.client_folders enable row level security;
alter table public.orders enable row level security;
alter table public.order_images enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_code_sequences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_notification_events enable row level security;

create policy "internal app reads client folders"
on public.client_folders for select to anon, authenticated using (true);

create policy "internal app reads orders"
on public.orders for select to anon, authenticated using (true);

create policy "internal app updates orders"
on public.orders for update to anon, authenticated using (true) with check (true);

create policy "internal app reads images"
on public.order_images for select to anon, authenticated using (true);

create policy "internal app reads status history"
on public.order_status_history for select to anon, authenticated using (true);

create policy "internal app creates status history"
on public.order_status_history for insert to anon, authenticated
with check (changed_by is null);

create policy "internal app reads order image objects"
on storage.objects for select to anon, authenticated
using (bucket_id = 'order-images');

create policy "prepared order image uploads only"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'order-images'
  and exists (
    select 1
    from public.order_images
    where order_images.storage_key = name
      and order_images.upload_status = 'pending'
  )
);

revoke all on function public.create_order(text, text, text) from public;
revoke all on function public.import_external_order(text, text, text, text, text, jsonb, text, text, numeric, timestamptz, text) from public;
revoke all on function public.update_order_details(uuid, text, text, text, text) from public;
revoke all on function public.soft_delete_order(uuid) from public;
revoke all on function public.prepare_order_image(uuid, uuid, uuid, text, text, bigint, text) from public;
revoke all on function public.update_order_image_description(uuid, text) from public;
revoke all on function public.complete_order_image(uuid) from public;
revoke all on function public.fail_order_image(uuid) from public;
revoke all on function public.claim_pending_order_notifications(uuid[]) from public;
revoke all on function public.enqueue_new_order_notification() from public;
revoke all on function public.preserve_locally_edited_order_details() from public;
revoke all on function public.reject_images_for_deleted_orders() from public;
revoke all on function public.assign_generic_order_code() from public;

revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_notification_events from anon, authenticated;

grant select on public.client_folders to anon, authenticated;
grant select, update on public.orders to anon, authenticated;
grant select on public.order_images to anon, authenticated;
grant select, insert on public.order_status_history to anon, authenticated;

grant execute on function public.create_order(text, text, text) to anon, authenticated;
grant execute on function public.import_external_order(text, text, text, text, text, jsonb, text, text, numeric, timestamptz, text) to service_role;
grant execute on function public.update_order_details(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.soft_delete_order(uuid) to anon, authenticated;
grant execute on function public.prepare_order_image(uuid, uuid, uuid, text, text, bigint, text) to anon, authenticated;
grant execute on function public.update_order_image_description(uuid, text) to anon, authenticated;
grant execute on function public.complete_order_image(uuid) to anon, authenticated;
grant execute on function public.fail_order_image(uuid) to anon, authenticated;
grant execute on function public.claim_pending_order_notifications(uuid[]) to service_role;
