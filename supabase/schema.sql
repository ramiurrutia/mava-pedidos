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
  name text not null check (length(trim(name)) > 0),
  normalized_name text generated always as (lower(trim(name))) stored,
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

insert into public.client_folders (name)
values ('Clash'), ('Juan'), ('María')
on conflict (normalized_name) do nothing;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  code_number bigint not null unique,
  client_id uuid not null references public.client_folders(id) on delete restrict,
  client_name text not null check (length(trim(client_name)) > 0),
  status public.order_status not null default 'pending',
  notes text not null default '',
  created_by uuid references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table public.order_images (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  storage_key text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
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

create index orders_status_idx on public.orders(status);
create index orders_client_pending_created_idx on public.orders(client_id, created_at desc)
where status = 'pending';
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_client_name_trgm_idx on public.orders using gin (client_name gin_trgm_ops);
create index order_images_order_id_idx on public.order_images(order_id);
create index status_history_order_id_idx on public.order_status_history(order_id, changed_at desc);

create or replace function public.create_order(
  requested_prefix text,
  requested_client_id uuid,
  requested_notes text default ''
) returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  sequence_number bigint;
  requested_client_name text;
  base_code text;
  generated_code text;
  matching_codes integer;
  created_order public.orders;
begin
  select name into requested_client_name
  from public.client_folders
  where id = requested_client_id;

  if requested_client_name is null then
    raise exception 'Unknown client folder';
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
    trim(requested_client_name),
    coalesce(requested_notes, ''),
    null
  )
  returning * into created_order;

  return created_order;
end;
$$;

create or replace function public.prepare_order_image(
  requested_client_id uuid,
  requested_order_id uuid,
  requested_image_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_size_bytes bigint
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
  if requested_order_id is not null then
    select id into target_order_id
    from public.orders
    where id = requested_order_id
      and client_id = requested_client_id
      and status = 'pending'
    for update;
  else
    select id into target_order_id
    from public.orders
    where client_id = requested_client_id
      and status = 'pending'
    order by created_at desc
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
    mime_type,
    size_bytes,
    uploaded_by
  )
  values (
    requested_image_id,
    target_order_id,
    'orders/' || target_order_id || '/' || requested_image_id || '/' || safe_filename,
    requested_filename,
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
begin
  update public.order_images
  set upload_status = 'ready'
  where id = requested_image_id
    and upload_status = 'pending';

  if not found then
    raise exception 'IMAGE_NOT_FOUND';
  end if;
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

revoke all on function public.create_order(text, uuid, text) from public;
revoke all on function public.prepare_order_image(uuid, uuid, uuid, text, text, bigint) from public;
revoke all on function public.complete_order_image(uuid) from public;
revoke all on function public.fail_order_image(uuid) from public;

grant select on public.client_folders to anon, authenticated;
grant select, update on public.orders to anon, authenticated;
grant select on public.order_images to anon, authenticated;
grant select, insert on public.order_status_history to anon, authenticated;

grant execute on function public.create_order(text, uuid, text) to anon, authenticated;
grant execute on function public.prepare_order_image(uuid, uuid, uuid, text, text, bigint) to anon, authenticated;
grant execute on function public.complete_order_image(uuid) to anon, authenticated;
grant execute on function public.fail_order_image(uuid) to anon, authenticated;
