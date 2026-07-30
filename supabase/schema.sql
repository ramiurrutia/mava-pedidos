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
security invoker
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
    auth.uid()
  )
  returning * into created_order;

  return created_order;
end;
$$;

create or replace function public.prepare_pending_order_image(
  requested_client_id uuid,
  requested_image_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_size_bytes bigint
) returns public.order_images
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order_id uuid;
  prepared_image public.order_images;
begin
  select id into target_order_id
  from public.orders
  where client_id = requested_client_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if target_order_id is null then
    raise exception 'NO_PENDING_ORDER';
  end if;

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
    'orders/' || target_order_id || '/' || requested_image_id || '/' || requested_filename,
    requested_filename,
    requested_mime_type,
    requested_size_bytes,
    auth.uid()
  )
  returning * into prepared_image;

  return prepared_image;
end;
$$;

alter table public.client_folders enable row level security;
alter table public.orders enable row level security;
alter table public.order_images enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_code_sequences enable row level security;

create policy "authenticated users read client folders"
on public.client_folders for select to authenticated using (true);

create policy "authenticated users read orders"
on public.orders for select to authenticated using (true);

create policy "authenticated users update orders"
on public.orders for update to authenticated using (true) with check (true);

create policy "authenticated users read images"
on public.order_images for select to authenticated using (true);

create policy "authenticated users create images for an existing order"
on public.order_images for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (select 1 from public.orders where orders.id = order_images.order_id)
);

create policy "authenticated users read status history"
on public.order_status_history for select to authenticated using (true);

create policy "authenticated users create status history"
on public.order_status_history for insert to authenticated
with check (changed_by = (select auth.uid()));

-- Private bucket paths must be generated server-side:
-- orders/{order_id}/{image_id}/{sanitized_filename}
