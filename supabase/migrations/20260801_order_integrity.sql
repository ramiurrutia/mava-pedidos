begin;

alter table public.client_folders
  add constraint client_folders_name_length_check
  check (length(trim(name)) between 1 and 80);

alter table public.orders
  add constraint orders_client_name_length_check
  check (length(trim(client_name)) between 1 and 80);

alter table public.order_images
  add constraint order_images_filename_check
  check (length(trim(original_filename)) between 1 and 255),
  add constraint order_images_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  add constraint order_images_size_limit_check
  check (size_bytes between 1 and 6291456);

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

drop trigger if exists orders_apply_update_metadata on public.orders;
create trigger orders_apply_update_metadata
before update on public.orders
for each row execute function public.apply_order_update_metadata();

drop trigger if exists orders_record_status_change on public.orders;
create trigger orders_record_status_change
after update of status on public.orders
for each row execute function public.record_order_status_change();

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
  if nullif(trim(requested_filename), '') is null or length(trim(requested_filename)) > 255 then
    raise exception 'INVALID_IMAGE_FILENAME';
  end if;

  if requested_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception 'UNSUPPORTED_IMAGE_TYPE';
  end if;

  if requested_size_bytes not between 1 and 6291456 then
    raise exception 'IMAGE_SIZE_OUT_OF_RANGE';
  end if;

  if requested_order_id is not null then
    select id into target_order_id
    from public.orders
    where id = requested_order_id
      and client_id = requested_client_id
      and status in ('pending', 'in_production')
    for update;
  else
    select id into target_order_id
    from public.orders
    where client_id = requested_client_id
      and status in ('pending', 'in_production')
    order by created_at desc, id desc
    limit 1
    for update;
  end if;

  if target_order_id is null then
    raise exception 'NO_PENDING_ORDER';
  end if;

  safe_filename := regexp_replace(
    requested_filename,
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

commit;

notify pgrst, 'reload schema';
